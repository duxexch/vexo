import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'game';
  const title = searchParams.get('title') || 'VEX Game';
  const titleAr = searchParams.get('titleAr') || 'لعبة VEX';
  const description = searchParams.get('description') || 'Play exciting games on VEX';
  const descriptionAr = searchParams.get('descriptionAr') || 'العب ألعاب مثيرة على VEX';
  
  // Create canvas for dynamic image generation
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    return new NextResponse('Canvas not supported', { status: 500 });
  }
  
  // Set canvas size for social media preview (1200x630 recommended)
  canvas.width = 1200;
  canvas.height = 630;
  
  try {
    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#070b14');
    gradient.addColorStop(1, '#1a1f3a');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // VEX Branding
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px system-ui, -apple-system, sans-serif';
    ctx.fillText('VEX', 80, 120);
    
    // Game/Content Title
    ctx.font = 'bold 48px system-ui, -apple-system, sans-serif';
    const displayTitle = type === 'game' ? titleAr : title;
    ctx.fillText(displayTitle, 80, 220);
    
    // Description
    ctx.font = '28px system-ui, -apple-system, sans-serif';
    const displayDescription = type === 'game' ? descriptionAr : description;
    const lines = wrapText(ctx, displayDescription, canvas.width - 160);
    lines.forEach((line, index) => {
      ctx.fillText(line, 80, 320 + (index * 35));
    });
    
    // URL at bottom
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(80, 520, 400, 60);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
    const url = searchParams.get('url') || 'https://vexo.click';
    ctx.fillText('vexo.click', 280, 560);
    
    // Generate image
    const imageData = canvas.toDataURL('image/png', 0.8);
    const base64Data = imageData.replace(/^data:image\/png;base64,/, '');
    
    return new NextResponse(Buffer.from(base64Data, 'base64'), {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000', // 1 year
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    return new NextResponse('Failed to generate image', { status: 500 });
  }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
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
