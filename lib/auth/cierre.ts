/** Marca de cierre de sesión pedido por el usuario: así SesionProvider no muestra el aviso de «sesión terminada». */
let voluntario = false;

export const marcarCierreVoluntario = () => {
  voluntario = true;
};

/** Devuelve si el último cierre fue voluntario y limpia la marca. */
export const consumirCierreVoluntario = () => {
  const v = voluntario;
  voluntario = false;
  return v;
};
