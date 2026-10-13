import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Por ahora, simplemente pasar todas las rutas sin procesamiento de i18n
  // El i18n se manejará en el cliente y en el layout
  return NextResponse.next();
}

export const config = {
  // Excluir archivos estáticos, API routes, y archivos del sistema
  matcher: [
    '/((?!api|_next|_vercel|.*\\..*|favicon.ico|robots.txt|sitemap.xml).*)'
  ]
};

