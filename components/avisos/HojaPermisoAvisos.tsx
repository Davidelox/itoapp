import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { colors, fonts } from '@/constants/theme';
import { marcarPreguntado, pedirPermiso, registrarDispositivo } from '@/lib/avisos/registro';
import { personas } from '@/lib/gastos/personas';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Explica para qué son los avisos ANTES del diálogo del sistema (que solo se puede enseñar una vez). */
export function HojaPermisoAvisos({ onCerrar }: { onCerrar: () => void }) {
  const { pareja } = useEstado();
  const [ocupado, setOcupado] = useState(false);
  const otra = pareja ? personas(pareja).otra : null;
  const nombre = otra ? personas(pareja!).nombrePareja : null;

  const activar = async () => {
    setOcupado(true);
    const estado = await pedirPermiso();
    await marcarPreguntado();
    if (estado === 'concedido') await registrarDispositivo();
    onCerrar();
  };
  const ahoraNo = async () => {
    await marcarPreguntado();
    onCerrar();
  };

  return (
    <Hoja visible titulo={nombre ? `¿Te avisamos de cobros, eventos y de lo que haga ${nombre}?` : '¿Te avisamos de cobros y eventos?'} onCerrar={ahoraNo} bloqueada={ocupado}>
      <Text style={styles.texto}>
        Recordatorios de eventos y cumpleaños, cobros próximos y peticiones de tu pareja. Puedes elegir cuáles en Ajustes.
      </Text>
      <BotonPrincipal etiqueta="Activar avisos" etiquetaCargando="Un momento…" cargando={ocupado} onPress={activar} />
      <EnlaceTexto etiqueta="Ahora no" deshabilitado={ocupado} onPress={ahoraNo} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
});
