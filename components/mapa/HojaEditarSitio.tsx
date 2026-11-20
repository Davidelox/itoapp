import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

import { Chip, FilaChips, Grupo, Interruptor } from '@/components/gastos/Controles';
import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal } from '@/components/onboarding/Botones';
import { MensajeError } from '@/components/onboarding/MensajeError';
import { colors, fonts, radius } from '@/constants/theme';
import { ErrorGasto } from '@/lib/gastos/error';
import { personas } from '@/lib/gastos/personas';
import { CATEGORIAS_SITIO, INFO_CATEGORIA_SITIO } from '@/lib/mapa/categorias';
import { editarSitio } from '@/lib/mapa/consultas';
import { ERROR_GENERICO } from '@/lib/mapa/error';
import { MAX_DIRECCION, MAX_NOMBRE, buscarDuplicado, puedeRevelar, validarSitio } from '@/lib/mapa/sitio';
import type { Sitio } from '@/lib/mapa/tipos';
import { useInvalidarMapa, useSitios } from '@/lib/mapa/useSitios';
import type { Pareja } from '@/lib/pareja/EstadoProvider';

/**
 * Editar un sitio (docs/plan-mapa.md §5.3): nombre, dirección, categoría y, si es privado y tuyo, revelarlo.
 * Se monta al abrirla (así parte siempre de lo guardado). Solo guarda lo que ha cambiado, con control de versión.
 */
export function HojaEditarSitio({ sitio, pareja, onCerrar }: { sitio: Sitio; pareja: Pareja; onCerrar: () => void }) {
  const invalidar = useInvalidarMapa();
  const { data: sitios = [] } = useSitios();
  const p = personas(pareja);
  const [nombre, setNombre] = useState(sitio.name);
  const [direccion, setDireccion] = useState(sitio.address ?? '');
  const [categoria, setCategoria] = useState(sitio.category);
  const [revelar, setRevelar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intentado, setIntentado] = useState(false);

  const errorNombre = validarSitio({ nombre, lat: sitio.lat, lng: sitio.lng }).nombre;

  const guardar = async () => {
    setIntentado(true);
    if (errorNombre) return;
    const cambios: Parameters<typeof editarSitio>[2] = {};
    if (nombre.trim() !== sitio.name) cambios.name = nombre.trim();
    if ((direccion.trim() || null) !== sitio.address) cambios.address = direccion.trim() || null;
    if (categoria !== sitio.category) cambios.category = categoria;
    if (revelar) cambios.visible_to_partner = true;
    if (Object.keys(cambios).length === 0) return onCerrar();
    // Mismo nombre y lugar que otro sitio de tu lista: no se guarda dos veces (p. ej. al revelar uno privado).
    if ((cambios.name || cambios.visible_to_partner) && buscarDuplicado(sitios, { nombre: nombre.trim(), lat: sitio.lat, lng: sitio.lng }, sitio.id)) {
      setError('Ya está en vuestro mapa.');
      return;
    }
    setOcupado(true);
    setError(null);
    try {
      await editarSitio(sitio.id, sitio.version, cambios, p.nombrePareja);
      await invalidar();
      onCerrar();
    } catch (e) {
      setError(e instanceof ErrorGasto ? e.message : ERROR_GENERICO);
      if (e instanceof ErrorGasto && e.codigo === 'version') await invalidar();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Hoja
      visible
      titulo="Editar sitio"
      onCerrar={onCerrar}
      bloqueada={ocupado}
      desplazable
      pie={<BotonPrincipal etiqueta="Guardar cambios" cargando={ocupado} onPress={guardar} />}
    >
      <Grupo etiqueta="Nombre">
        <TextInput accessibilityLabel="Nombre" value={nombre} onChangeText={setNombre} maxLength={MAX_NOMBRE} autoCapitalize="sentences" style={styles.campo} />
        <MensajeError texto={intentado ? errorNombre : null} />
      </Grupo>
      <Grupo etiqueta="Dirección (opcional)">
        <TextInput accessibilityLabel="Dirección" value={direccion} onChangeText={setDireccion} maxLength={MAX_DIRECCION} autoCapitalize="sentences" style={styles.campo} />
      </Grupo>
      <Grupo etiqueta="Categoría" rol="radiogroup">
        <FilaChips>
          {CATEGORIAS_SITIO.map((c) => (
            <Chip key={c} rol="radio" etiqueta={INFO_CATEGORIA_SITIO[c].etiqueta} icono={INFO_CATEGORIA_SITIO[c].icono} activo={categoria === c} onPress={() => setCategoria(c)} />
          ))}
        </FilaChips>
      </Grupo>
      {puedeRevelar(sitio, pareja.yo.userId) && p.otra ? (
        <Interruptor titulo={`Revelar a ${p.nombrePareja}`} ayuda={`${p.nombrePareja} lo verá. No se puede volver a ocultar.`} valor={revelar} onCambiar={setRevelar} />
      ) : null}
      <MensajeError texto={error} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  campo: { height: 50, paddingHorizontal: 16, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.white, fontFamily: fonts.body, fontSize: 16, color: colors.text },
});
