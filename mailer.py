"""Quote confirmation emails.

Configured entirely by environment variables (nothing is sent if SMTP_HOST or MAIL_FROM is missing):

  MAIL_FROM       Rangechem sender address, e.g. quotes@rangechem.co.za (also the Reply-To)
  MAIL_NOTIFY     Staff address(es) that receive a copy, comma separated. Defaults to MAIL_FROM
  SMTP_HOST       Mail server, e.g. mail.rangechem.co.za
  SMTP_PORT       Default 465
  SMTP_SECURITY   ssl (default), starttls or none
  SMTP_USER       Login, normally the full MAIL_FROM address
  SMTP_PASSWORD   Mailbox password

The quote is attached as a PDF (reportlab) or, if reportlab is not installed, as an HTML file.
"""
import html
import io
import logging
import os
import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr, formatdate, make_msgid
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

log = logging.getLogger('rangechem.mail')
ROOT = Path(__file__).resolve().parent
RED = '#d63121'


def reference(quote_id):
    return 'RC-%05d' % int(quote_id)


def config():
    host, sender = os.getenv('SMTP_HOST', '').strip(), os.getenv('MAIL_FROM', '').strip()
    if not host or not sender:
        return None
    notify = [a.strip() for a in (os.getenv('MAIL_NOTIFY') or sender).split(',') if a.strip()]
    return {
        'host': host, 'port': int(os.getenv('SMTP_PORT', '465')),
        'security': os.getenv('SMTP_SECURITY', 'ssl').strip().lower(),
        'user': os.getenv('SMTP_USER', '').strip(), 'password': os.getenv('SMTP_PASSWORD', ''),
        'sender': sender, 'notify': notify,
    }


def one_line(value):
    return ' '.join(str(value or '').split())


def _rows_html(items):
    return ''.join(
        '<tr><td style="padding:8px;border-bottom:1px solid #eee">%s</td><td style="padding:8px;border-bottom:1px solid #eee">%s</td>'
        '<td style="padding:8px;border-bottom:1px solid #eee">%s</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">%s</td></tr>'
        % (html.escape(one_line(i.get('name'))), html.escape(one_line(i.get('size'))), html.escape(one_line(i.get('stock_code'))), int(i.get('quantity', 0)))
        for i in items)


def quote_html(ref, customer, items, created, intro=''):
    """A complete, self-contained HTML document (used for the email body and as the HTML attachment fallback)."""
    total = sum(int(i.get('quantity', 0)) for i in items)
    message = html.escape(customer.get('message', '')).replace('\n', '<br>')
    details = ''.join('<div><strong>%s:</strong> %s</div>' % (label, html.escape(one_line(customer.get(key))))
                      for label, key in (('Name', 'name'), ('Email', 'email'), ('Phone', 'phone'), ('Company', 'company')) if customer.get(key))
    return (
        '<!doctype html><html><body style="margin:0;background:#f4f2ef;font-family:Arial,Helvetica,sans-serif;color:#141414">'
        '<div style="max-width:640px;margin:0 auto;background:#fff">'
        '<div style="background:#141414;color:#fff;padding:22px 28px;font-size:22px;font-weight:bold">RANGE <span style="color:%s">CHEM</span></div>'
        '<div style="padding:28px"><h2 style="margin:0 0 6px">Quote request %s</h2><div style="color:#666;font-size:13px;margin-bottom:18px">%s</div>%s'
        '<div style="font-size:14px;line-height:1.7;margin-bottom:18px">%s</div>%s'
        '<table style="width:100%%;border-collapse:collapse;font-size:14px"><thead><tr style="text-align:left;color:#666;font-size:12px;text-transform:uppercase">'
        '<th style="padding:8px">Product</th><th style="padding:8px">Size</th><th style="padding:8px">Code</th><th style="padding:8px;text-align:right">Qty</th></tr></thead><tbody>%s</tbody></table>'
        '<p style="font-size:13px;color:#666">%d item(s) in total. Pricing will be confirmed by our team.</p></div>'
        '<div style="background:#141414;color:#c6c1bd;padding:16px 28px;font-size:12px">Rangechem &middot; info@rangechem.co.za &middot; 021 981 3320</div>'
        '</div></body></html>'
        % (RED, html.escape(ref), html.escape(created), intro, details,
           ('<div style="background:#faf9f7;border-radius:6px;padding:12px 14px;font-size:14px;margin-bottom:18px"><strong>Your message</strong><br>%s</div>' % message) if message else '',
           _rows_html(items), total))


def quote_text(ref, customer, items):
    lines = ['Quote request ' + ref, '']
    lines += ['%s: %s' % (label, one_line(customer.get(key))) for label, key in (('Name', 'name'), ('Email', 'email'), ('Phone', 'phone'), ('Company', 'company')) if customer.get(key)]
    lines += ['', 'Items:'] + ['- %s | %s | %s | x%d' % (one_line(i.get('name')), one_line(i.get('size')), one_line(i.get('stock_code')), int(i.get('quantity', 0))) for i in items]
    if customer.get('message'):
        lines += ['', 'Message:', customer['message']]
    return '\n'.join(lines)


def quote_pdf(ref, customer, items, created):
    """Return PDF bytes, or None when reportlab is not installed."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
        from reportlab.lib.units import mm
        from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        return None
    styles = getSampleStyleSheet()
    small = ParagraphStyle('small', parent=styles['Normal'], fontSize=9, leading=12, textColor=colors.HexColor('#555555'))
    cell = ParagraphStyle('cell', parent=styles['Normal'], fontSize=9, leading=12)
    p = lambda text, style=styles['Normal']: Paragraph(xml_escape(one_line(text)), style)
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=16 * mm, bottomMargin=16 * mm, title='Rangechem quote request ' + ref, author='Rangechem')
    story = []
    logo = ROOT / 'assets' / 'RC_Logo.png'
    header = [[Image(str(logo), 16 * mm, 16 * mm) if logo.exists() else '', Paragraph('<font size=20><b>RANGE <font color="%s">CHEM</font></b></font><br/><font size=9 color="#666666">Industrial cleaning solutions. Personal service.</font>' % RED, styles['Normal'])]]
    story += [Table(header, colWidths=[20 * mm, 140 * mm], style=[('VALIGN', (0, 0), (-1, -1), 'MIDDLE')]), Spacer(1, 8 * mm)]
    story += [Paragraph('<b>Quote request %s</b>' % xml_escape(ref), styles['Heading2']), p('Submitted ' + created, small), Spacer(1, 4 * mm)]
    for label, key in (('Name', 'name'), ('Email', 'email'), ('Phone', 'phone'), ('Company', 'company')):
        if customer.get(key):
            story.append(Paragraph('<b>%s:</b> %s' % (label, xml_escape(one_line(customer[key]))), styles['Normal']))
    if customer.get('message'):
        story += [Spacer(1, 3 * mm), Paragraph('<b>Message:</b><br/>' + xml_escape(customer['message']).replace('\n', '<br/>'), styles['Normal'])]
    rows = [['Product', 'Size', 'Stock code', 'Qty']] + [[p(i.get('name'), cell), p(i.get('size'), cell), p(i.get('stock_code'), cell), str(int(i.get('quantity', 0)))] for i in items]
    table = Table(rows, colWidths=[88 * mm, 24 * mm, 32 * mm, 16 * mm], repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#141414')), ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, 0), 9), ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'), ('FONTSIZE', (3, 1), (3, -1), 9),
        ('ALIGN', (3, 0), (3, -1), 'RIGHT'), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7f5f3')]), ('LINEBELOW', (0, 0), (-1, -1), 0.25, colors.HexColor('#dddddd')),
    ]))
    story += [Spacer(1, 6 * mm), table, Spacer(1, 5 * mm),
              p('%d item(s) in total. Pricing will be confirmed by our team.' % sum(int(i.get('quantity', 0)) for i in items), small)]
    doc.build(story)
    return buffer.getvalue()


def build_messages(cfg, ref, customer, items, created):
    pdf = quote_pdf(ref, customer, items, created)
    attachment = (pdf, 'application/pdf', 'Rangechem-Quote-%s.pdf' % ref) if pdf else (quote_html(ref, customer, items, created).encode('utf-8'), 'text/html', 'Rangechem-Quote-%s.html' % ref)
    sender = formataddr(('Rangechem', cfg['sender']))
    name = one_line(customer.get('name'))
    thanks = ('<p style="font-size:15px;line-height:1.6">Hi %s,</p><p style="font-size:15px;line-height:1.6">Thank you for your quote request. We have received it and our team will be in touch shortly with pricing. '
              'A copy of your quote is attached for your records.</p>' % html.escape(name))
    client = EmailMessage()
    client['From'], client['To'], client['Reply-To'] = sender, customer['email'], cfg['sender']
    client['Subject'] = 'Your Rangechem quote request %s' % ref
    client['Date'], client['Message-ID'] = formatdate(localtime=True), make_msgid(domain=cfg['sender'].split('@')[-1])
    client.set_content('Hi %s,\n\nThank you for your quote request. We have received it and our team will be in touch shortly with pricing. A copy is attached for your records.\n\n%s\n\nRangechem\n021 981 3320' % (name, quote_text(ref, customer, items)))
    client.add_alternative(quote_html(ref, customer, items, created, thanks), subtype='html')
    staff = EmailMessage()
    staff['From'], staff['To'], staff['Reply-To'] = sender, ', '.join(cfg['notify']), formataddr((name, customer['email']))
    staff['Subject'] = 'New quote request %s from %s' % (ref, name[:80])
    staff['Date'], staff['Message-ID'] = formatdate(localtime=True), make_msgid(domain=cfg['sender'].split('@')[-1])
    staff.set_content(quote_text(ref, customer, items))
    staff.add_alternative(quote_html(ref, customer, items, created, '<p style="font-size:14px">A new quote request was submitted on the website. Reply to this email to contact the customer.</p>'), subtype='html')
    for message in (client, staff):
        data, mime, filename = attachment
        main, sub = mime.split('/')
        message.add_attachment(data, maintype=main, subtype=sub, filename=filename)
    return client, staff


def _connect(cfg):
    if cfg['security'] == 'ssl':
        server = smtplib.SMTP_SSL(cfg['host'], cfg['port'], context=ssl.create_default_context(), timeout=20)
    else:
        server = smtplib.SMTP(cfg['host'], cfg['port'], timeout=20)
        if cfg['security'] == 'starttls':
            server.starttls(context=ssl.create_default_context())
    if cfg['user']:
        server.login(cfg['user'], cfg['password'])
    return server


def send_quote_emails(quote_id, customer, items, created):
    """Send the customer confirmation and the staff copy. Never raises: failures are logged."""
    cfg = config()
    if not cfg:
        return False
    ref = reference(quote_id)
    try:
        messages = build_messages(cfg, ref, customer, items, created)
        with _connect(cfg) as server:
            for message in messages:
                try:
                    server.send_message(message)
                except Exception:
                    log.exception('Could not send %s email for %s', 'customer' if message is messages[0] else 'staff', ref)
        return True
    except Exception:
        log.exception('Could not send quote emails for %s', ref)
        return False
