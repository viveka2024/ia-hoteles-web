// /api/offersFidelityHelper.js
import { supabase } from './supabaseClient.js';

/**
 * Devuelve el texto de la última oferta activa de Fidelity.
 */
export async function getLatestFidelityOfferText() {
  const now = new Date().toISOString();
  const { data: offers = [], error } = await supabase
    .from('fidelity_offers')
    .select('text')
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('offersFidelityHelper#getLatestFidelityOfferText error:', error);
    return '– No hay ofertas activas en este momento.';
  }

  return offers.length
    ? `– ${offers[0].text}`
    : '– No hay ofertas activas en este momento.';
}
