import { NextResponse } from 'next/server';
import { updateBrand, deleteBrand } from '@/server/services/catalogue-service'; // <-- CHANGE THIS LINE

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const updated = await updateBrand(params.id, body); // <-- CHANGE THIS LINE
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    await deleteBrand(params.id); // <-- CHANGE THIS LINE
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}