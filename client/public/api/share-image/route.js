export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'game';
  const title = searchParams.get('title') || 'VEX Game';
  const titleAr = searchParams.get('titleAr') || 'لعبة VEX';
  const description = searchParams.get('description') || 'Play exciting games on VEX';
  const descriptionAr = searchParams.get('descriptionAr') || 'العب ألعاب ممتعة على VEX';
  
  // Create canvas for dynamic image generation
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return new Response('Canvas not supported', { status: 500 });
  }
  
  // Set canvas size for social media preview (1200x630 recommended)
  canvas.width = 1200;
  canvas.height = 630;
  
  try {
    // Background gradient matching VEX brand
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#070b14');
    gradient.addColorStop(1, '#1a1f3a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // VEX Branding - Large logo text
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 120px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VEX', canvas.width / 2, 180);
    
    // Subtitle
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#a855f7';
    const subtitle = type === 'game' ? titleAr : title;
    ctx.fillText(subtitle, canvas.width / 2, 280);
    
    // Main description
    ctx.font = '36px system-ui, -apple-system, sans-serif';
    ctx.fillStyle = '#ffffff';
    const displayDescription = type === 'game' ? descriptionAr : description;
    const lines = wrapText(ctx, displayDescription, canvas.width - 240);
    lines.forEach((line, index) => {
      ctx.fillText(line, canvas.width / 2, 380 + (index * 45));
    });
    
    // URL at bottom
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(canvas.width / 2 - 300, 520, 600, 80);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
    const url = searchParams.get('url') || 'https://vexo.click';
    ctx.fillText(url, canvas.width / 2, 580);
    
    // Generate high-quality image
    const imageData = canvas.toDataURL('image/png', 0.9);
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    
    // Convert to binary
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    return new Response(bytes, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000', // 1 year
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new Response('Failed to generate image', { status: 500 });
  }
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let currentLine = '';
  
  words.forEach(word => {
    const testLine = currentLine + (currentLine ? ' ' : '') + word;
    const metrics = ctx.measureText(testLine);
    
    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  });
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}
