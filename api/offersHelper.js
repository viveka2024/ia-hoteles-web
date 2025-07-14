// api/offersHelper.js
import { supabase } from './supabaseClient.js';

/**
 * Devuelve el texto de la última oferta activa o un mensaje genérico.
 */
export async function getLatestOfferText() {
  const now = new Date().toISOString();
  const { data: offers = [], error } = await supabase
    .from('hotel_offers')
    .select('text')
    .eq('active', true)
    .or(`expires_at.is.null,expires_at.gt.${now}`)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('offersHelper#getLatestOfferText error:', error);
    return '– No hay ofertas activas en este momento.';
  }

  return offers.length
    ? `– ${offers[0].text}`
    : '– No hay ofertas activas en este momento.';
}
