export type DiagramFormat = 'png' | 'svg' | 'pdf';

const svgNamespace = 'http://www.w3.org/2000/svg';
const padding = 24;

export async function exportDiagram(stage: SVGGElement, defs: SVGDefsElement, format: DiagramFormat) {
  const bounds = stage.getBBox();
  if (!bounds.width || !bounds.height) throw new Error('当前视图没有可导出的内容。');

  const width = Math.ceil(bounds.width + padding * 2);
  const height = Math.ceil(bounds.height + padding * 2);
  const scale = format === 'svg' ? 1 : Math.min(2, 5000 / Math.max(width, height));
  const outputWidth = Math.ceil(width * scale);
  const outputHeight = Math.ceil(height * scale);
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('width', String(outputWidth));
  svg.setAttribute('height', String(outputHeight));
  svg.setAttribute('viewBox', `${bounds.x - padding} ${bounds.y - padding} ${width} ${height}`);
  svg.setAttribute('font-family', getComputedStyle(stage).fontFamily || 'sans-serif');

  const background = document.createElementNS(svgNamespace, 'rect');
  background.setAttribute('x', String(bounds.x - padding));
  background.setAttribute('y', String(bounds.y - padding));
  background.setAttribute('width', String(width));
  background.setAttribute('height', String(height));
  background.setAttribute('fill', '#ffffff');

  const drawing = stage.cloneNode(true) as SVGGElement;
  drawing.querySelectorAll('[data-node-action], .x6-cell-tools').forEach(element => element.remove());
  svg.append(defs.cloneNode(true), background, drawing);
  const vector = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' });
  if (format === 'svg') return vector;

  const url = URL.createObjectURL(vector);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = outputWidth;
    canvas.height = outputHeight;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('无法创建导出画布。');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
    context.drawImage(image, 0, 0);
    const type = format === 'png' ? 'image/png' : 'image/jpeg';
    const raster = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('无法生成导出图片。')), type, 0.96);
    });
    return format === 'png' ? raster : imagePdf(raster, outputWidth, outputHeight, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function imagePdf(image: Blob, pixelWidth: number, pixelHeight: number, width: number, height: number) {
  // PDF 页面按图纸比例定尺寸，大图保留全图并限制页面坐标范围。
  const scale = Math.min(0.75, 14400 / Math.max(width, height));
  const pageWidth = (width * scale).toFixed(2);
  const pageHeight = (height * scale).toFixed(2);
  const paint = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Diagram Do\nQ\n`;
  const objects: BlobPart[][] = [
    ['<< /Type /Catalog /Pages 2 0 R >>'],
    ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>'],
    [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Diagram 5 0 R >> >> /Contents 4 0 R >>`],
    [`<< /Length ${paint.length} >>\nstream\n${paint}endstream`],
    [`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.size} >>\nstream\n`, image, '\nendstream'],
  ];
  const header = '%PDF-1.4\n';
  const offsets: number[] = [];
  let size = header.length;
  const bodies = objects.map((parts, index) => {
    offsets.push(size);
    const body = new Blob([`${index + 1} 0 obj\n`, ...parts, '\nendobj\n']);
    size += body.size;
    return body;
  });
  const xref = offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  return new Blob([header, ...bodies,
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`,
  ], { type: 'application/pdf' });
}
