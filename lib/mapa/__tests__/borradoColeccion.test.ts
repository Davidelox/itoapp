import { avisoBorradoColeccion, esPrevision, resultadoBorrado, textoHojaBorrarColeccion } from '@/lib/mapa/borradoColeccion';

describe('resultadoBorrado', () => {
  it('borrada para las dos, con o sin solicitud previa de la pareja', () => {
    expect(resultadoBorrado({ status: 'deleted' })).toEqual({ borrado: true });
    expect(resultadoBorrado({ status: 'deleted', request_id: 'r1' })).toEqual({ borrado: true, requestId: 'r1' });
    expect(resultadoBorrado({ status: 'approved' })).toEqual({ borrado: true });
  });
  it('dejada: borrada para ti, la pareja la conserva', () => {
    expect(resultadoBorrado({ status: 'deleted', kept_by_partner: true })).toEqual({ borrado: true, dejada: true });
  });
  it('pendiente', () => {
    expect(resultadoBorrado({ status: 'pending', request_id: 'r2' })).toEqual({ borrado: false, requestId: 'r2' });
  });
  it('solicitud ya resuelta o sin datos: null', () => {
    expect(resultadoBorrado({ status: 'rejected' })).toBeNull();
    expect(resultadoBorrado(null)).toBeNull();
  });
});

describe('textoHojaBorrarColeccion', () => {
  it('un texto por caso, con el nombre y la pareja', () => {
    expect(textoHojaBorrarColeccion('delete', 'Cenas', 'Meri')).toMatchObject({ titulo: '¿Borrar «Cenas»?', boton: 'Borrar' });
    const leave = textoHojaBorrarColeccion('leave', 'Cenas', 'Meri');
    expect(leave.texto).toContain('Meri la conserva');
    expect(leave.texto).toContain('volver a compartirla');
    expect(textoHojaBorrarColeccion('approval', 'Cenas', 'Meri')).toMatchObject({ boton: 'Enviar solicitud' });
    expect(textoHojaBorrarColeccion('approval', 'Cenas', 'Meri').texto).toContain('Meri tendrá que aprobarlo');
  });
  it('plan: sin botón de borrar', () => {
    expect(textoHojaBorrarColeccion('plan', 'Viaje', 'Meri').boton).toBeNull();
  });
  it('sin previsión (cargando o fallo): texto genérico y el botón sigue disponible', () => {
    const t = textoHojaBorrarColeccion(null, 'Cenas', 'Meri');
    expect(t.boton).toBe('Borrar');
    expect(t.texto).toBe('Los sitios no se borran. Si Meri añadió sitios, tendrá que aprobarlo.');
  });
});

describe('avisoBorradoColeccion / esPrevision', () => {
  it('un aviso por resultado', () => {
    expect(avisoBorradoColeccion({ borrado: true }, 'Meri')).toBe('Colección borrada');
    expect(avisoBorradoColeccion({ borrado: true, dejada: true }, 'Meri')).toBe('Has dejado la colección: Meri la conserva');
    expect(avisoBorradoColeccion({ borrado: false }, 'Meri')).toBe('Solicitud enviada a Meri');
  });
  it('esPrevision solo acepta los cuatro valores', () => {
    expect(['delete', 'leave', 'approval', 'plan'].every(esPrevision)).toBe(true);
    expect(esPrevision('otro')).toBe(false);
    expect(esPrevision(null)).toBe(false);
  });
});
