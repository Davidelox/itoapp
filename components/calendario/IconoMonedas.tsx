import Svg, { Ellipse, Path } from 'react-native-svg';

/**
 * Pila de 3 monedas dibujada en SVG (no depende de ninguna fuente de iconos, que en la development build puede no estar
 * cargada). `tinta`: color del trazo; `fondo`: relleno de cada moneda (el del cuadrado) para que tapen a la de debajo.
 * Decorativa: el significado lo dan las etiquetas de las filas.
 */
export function IconoMonedas({ tamano, tinta, fondo = 'none' }: { tamano: number; tinta: string; fondo?: string }) {
  const monedas = [16, 11, 6]; // centro de la elipse de arriba de cada moneda, de abajo a arriba
  return (
    <Svg width={tamano} height={tamano} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {monedas.map((cy) => (
        <Path key={cy} d={`M3.5 ${cy} v3.5 a8.5 3.2 0 0 0 17 0 V${cy}`} fill={fondo} stroke={tinta} strokeWidth={1.8} strokeLinejoin="round" />
      ))}
      {monedas.map((cy) => (
        <Ellipse key={`e${cy}`} cx={12} cy={cy} rx={8.5} ry={3.2} fill={fondo} stroke={tinta} strokeWidth={1.8} />
      ))}
    </Svg>
  );
}
