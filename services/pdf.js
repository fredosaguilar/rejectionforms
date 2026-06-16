const PDFDocument = require('pdfkit');

const FORM_LABELS = {
  vehicle_removal: 'Vehicle Removal E&O Acknowledgment',
  auto_cov:        'Auto Coverage Recommendation',
  home_cov:        'Homeowners Coverage Recommendation',
  trucking_cov:    'Trucking Coverage Recommendation',
  contractor_cov:  'Contractor Coverage Recommendation',
};

function generatePDF(submission) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({ margin: 50, size: 'LETTER' });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const data    = submission.form_data || {};
    const label   = FORM_LABELS[submission.form_type] || submission.form_type;
    const date    = new Date(submission.submitted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const navy    = '#0f2644';
    const gold    = '#c8922a';
    const muted   = '#6b6560';
    const W       = doc.page.width - 100;

    // ── Header bar ───────────────────────────────────────────────────────────
    doc.rect(50, 50, W, 4).fill(navy);
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(16).fillColor(navy)
       .text('Quincy Alliance Insurance LLC', 50, 65);
    doc.font('Helvetica').fontSize(10).fillColor(muted)
       .text('DBA Columbia Basin Insurance', 50, 84);

    doc.font('Helvetica-Bold').fontSize(13).fillColor(navy)
       .text(label, 50, 110);

    // ── Meta row ─────────────────────────────────────────────────────────────
    doc.rect(50, 130, W, 0.5).fill('#e0dcd4');
    doc.font('Helvetica').fontSize(9).fillColor(muted)
       .text(`Date: ${date}   |   Ref: EO-${submission.id}   |   Agent: ${submission.agent_name || '—'}`, 50, 138);
    doc.rect(50, 150, W, 0.5).fill('#e0dcd4');

    doc.moveDown(1);
    let y = 160;

    function sectionTitle(title) {
      doc.rect(50, y, W, 18).fill('#f4f2ee');
      doc.font('Helvetica-Bold').fontSize(9).fillColor(navy)
         .text(title.toUpperCase(), 55, y + 5);
      y += 24;
    }

    function row(label, value, indent = 50) {
      if (y > 700) { doc.addPage(); y = 50; }
      doc.font('Helvetica-Bold').fontSize(9).fillColor(muted).text(label, indent, y);
      doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a').text(value || '—', indent + 160, y);
      y += 16;
    }

    function twoCol(items) {
      const half = Math.ceil(items.length / 2);
      const left = items.slice(0, half);
      const right = items.slice(half);
      const startY = y;
      left.forEach(([l, v]) => { row(l, v, 50); });
      const leftEndY = y;
      y = startY;
      right.forEach(([l, v]) => { row(l, v, 310); });
      y = Math.max(leftEndY, y) + 4;
    }

    // ── Vehicle Removal ───────────────────────────────────────────────────────
    if (submission.form_type === 'vehicle_removal') {
      sectionTitle('Policy Information / Información de Póliza');
      twoCol([
        ['Named insured / Asegurado', submission.client_name],
        ['Policy # / Número de póliza', submission.policy_number],
        ['Carrier / Compañía', submission.carrier],
        ['Effective date of removal', data.effectiveDate],
        ['Date of request', data.requestDate],
      ]);
      sectionTitle('Vehicle Details / Detalles del Vehículo');
      twoCol([
        ['Year / Año', data.year],
        ['Make / Marca', data.make],
        ['Model / Modelo', data.model],
        ['VIN (last 4)', data.vin],
      ]);
      if (data.reason || data.reasonOther) {
        sectionTitle('Reason for Removal / Motivo de Eliminación');
        row('Reason / Motivo', data.reason || data.reasonOther);
      }
      sectionTitle('Client Acknowledgments / Reconocimientos del Cliente');
      const acks = [
        'I have requested the removal of the above vehicle from my policy.',
        'I understand that once removed, this vehicle will no longer have any insurance coverage.',
        'I understand I will be personally responsible for any damages if vehicle is operated after removal.',
        'I understand my insurance agent and agency have explained the risks involved.',
        'I have been offered the opportunity to keep coverage but have chosen to remove it.',
      ];
      acks.forEach(a => {
        if (y > 700) { doc.addPage(); y = 50; }
        doc.rect(55, y + 1, 8, 8).stroke('#0f2644');
        doc.font('Helvetica').fontSize(8).fillColor('#1a1a1a').text(a, 70, y, { width: W - 20 });
        y += 20;
      });

    // ── Coverage forms ────────────────────────────────────────────────────────
    } else {
      sectionTitle('Policy Information / Información de Póliza');
      twoCol([
        ['Named insured / Asegurado', submission.client_name],
        ['Policy # / Número de póliza', submission.policy_number],
        ['Carrier / Compañía', submission.carrier],
        ['Effective date / Vigencia', data.effectiveDate],
        ['Agent / Agente', submission.agent_name],
        ['Date / Fecha', date],
      ]);

      const coverages = data.coverages || [];
      if (coverages.length) {
        sectionTitle('Coverage Selections / Selecciones de Cobertura');

        // Table header
        doc.rect(50, y, W, 16).fill(navy);
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#ffffff')
           .text('Coverage / Cobertura', 55, y + 4)
           .text('Status', 300, y + 4)
           .text('Recommended', 360, y + 4)
           .text('Client Selected', 465, y + 4);
        y += 18;

        coverages.forEach((c, i) => {
          if (y > 700) { doc.addPage(); y = 50; }
          const bg = i % 2 === 0 ? '#ffffff' : '#f9f8f6';
          doc.rect(50, y, W, 18).fill(bg);
          const statusColor = c.status === 'offered' ? '#16a34a' : c.status === 'declined' ? '#dc2626' : muted;
          const statusLabel = c.status === 'offered' ? 'Offered' : c.status === 'declined' ? 'Declined' : '—';
          doc.font('Helvetica').fontSize(8).fillColor('#1a1a1a')
             .text(c.name || '—', 55, y + 5, { width: 240 });
          doc.font('Helvetica-Bold').fontSize(8).fillColor(statusColor)
             .text(statusLabel, 300, y + 5);
          doc.font('Helvetica').fontSize(8).fillColor(muted)
             .text(c.recommended || '—', 360, y + 5, { width: 100 })
             .text(c.selected || '—', 465, y + 5, { width: 100 });
          doc.rect(50, y + 18, W, 0.5).fill('#e0dcd4');
          y += 19;
        });
        y += 8;
      }

      if (data.notes) {
        sectionTitle('Notes / Notas');
        doc.font('Helvetica').fontSize(9).fillColor('#1a1a1a')
           .text(data.notes, 55, y, { width: W - 10 });
        y = doc.y + 12;
      }

      const otherProducts = data.otherProducts || [];
      if (otherProducts.length) {
        sectionTitle('Other Products Offered / Otros Productos Ofrecidos');
        const statusLabel = { quoted: 'Quote provided', accepted: 'Accepted', declined: 'Declined' };
        otherProducts.forEach(p => {
          row(p.product, `${statusLabel[p.status] || p.status || '—'}${p.notes ? ' — ' + p.notes : ''}`);
        });
        y += 4;
      }
    }

    // ── Acknowledgment ────────────────────────────────────────────────────────
    if (y > 650) { doc.addPage(); y = 50; }
    y += 10;
    sectionTitle('Acknowledgment & Signature / Reconocimiento y Firma');
    doc.font('Helvetica').fontSize(8).fillColor(muted)
       .text('By signing below, I acknowledge that I have read, understand, and agree to the statements above.', 55, y, { width: W - 10 });
    y = doc.y + 4;
    doc.font('Helvetica').fontSize(8).fillColor(muted)
       .text('Al firmar a continuación, reconozco que he leído, entiendo y acepto las declaraciones anteriores.', 55, y, { width: W - 10, oblique: true });
    y = doc.y + 20;

    // Signature lines
    const sigY = y;
    doc.rect(55, sigY + 30, 200, 0.5).fill('#1a1a1a');
    doc.rect(320, sigY + 30, 200, 0.5).fill('#1a1a1a');
    doc.font('Helvetica').fontSize(8).fillColor(muted)
       .text('Client Signature / Firma del Cliente', 55, sigY + 34)
       .text('Agent Signature / Firma del Agente', 320, sigY + 34);
    doc.rect(55, sigY + 55, 200, 0.5).fill('#1a1a1a');
    doc.rect(320, sigY + 55, 200, 0.5).fill('#1a1a1a');
    doc.font('Helvetica').fontSize(8).fillColor(muted)
       .text('Print Name / Nombre en Letra de Molde', 55, sigY + 59)
       .text('Date / Fecha', 320, sigY + 59);

    // ── Footer ────────────────────────────────────────────────────────────────
    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.rect(50, 760, W, 0.5).fill('#e0dcd4');
      doc.font('Helvetica').fontSize(7).fillColor(muted)
         .text(`Columbia Basin Insurance  |  EO-${submission.id}  |  ${date}  |  Page ${i + 1} of ${pageCount}`, 50, 765, { align: 'center', width: W });
    }

    doc.end();
  });
}

module.exports = { generatePDF };
