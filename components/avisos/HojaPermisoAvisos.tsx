import { useState } from 'react';
import { Text } from 'react-native';

import { Hoja } from '@/components/gastos/Hoja';
import { BotonPrincipal, EnlaceTexto } from '@/components/onboarding/Botones';
import { fonts } from '@/constants/theme';
import { crearEstilos, useColores } from '@/lib/tema';
import { marcarPreguntado, pedirPermiso, registrarDispositivo } from '@/lib/avisos/registro';
import { personas } from '@/lib/gastos/personas';
import { useEstado } from '@/lib/pareja/EstadoProvider';

/** Explica para qué son los avisos ANTES del diálogo del sistema (que solo se puede enseñar una vez). */
export function HojaPermisoAvisos({ onCerrar }: { onCerrar: () => void }) {
  const colors = useColores();
  const styles = useStyles();
  const { pareja } = useEstado();
  const [ocupado, setOcupado] = useState(false);
  const otra = pareja ? personas(pareja, colors).otra : null;
  const nombre = otra ? personas(pareja!, colors).nombrePareja : null;

  const activar = async () => {
    setOcupado(true);
    try {
      const estado = await pedirPermiso();
      await marcarPreguntado();
      // El registro sigue por su cuenta: la hoja no espera al token. El resultado se ve en Ajustes → Avisos.
      if (estado === 'concedido') void registrarDispositivo();
    } finally {
      setOcupado(false);
      onCerrar();
    }
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

const useStyles = crearEstilos((colors) => ({
  texto: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.text },
}));
