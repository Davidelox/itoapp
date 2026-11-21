import { esEcoDeSeleccion } from '@/lib/mapa/sugerencias';
import { formularioDeResultado } from '@/lib/mapa/sitio';

describe('esEcoDeSeleccion', () => {
  it('el texto que dejó la selección no reabre la cascada; escribir algo distinto sí', () => {
    expect(esEcoDeSeleccion('Casa Lola', 'Casa Lola')).toBe(true);
    expect(esEcoDeSeleccion('Casa Lol', 'Casa Lola')).toBe(false);
    expect(esEcoDeSeleccion('Casa Lola', null)).toBe(false);
  });
});

describe('formularioDeResultado', () => {
  it('guarda como «Quiero ir», compartido y con el id del lugar', () => {
    const f = formularioDeResultado({ nombre: 'Bar X', direccion: null, categoria: 'bar', lat: 40, lng: -3, provider_place_id: 'N1' });
    expect(f).toMatchObject({ nombre: 'Bar X', direccion: '', categoria: 'bar', estado: 'want_to_go', privado: false, lat: 40, lng: -3, lugarId: 'N1' });
  });
});
