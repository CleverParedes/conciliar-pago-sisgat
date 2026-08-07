import "../versiones-pendientes.css";
import "./AjustesAutomaticosDetalle.css";

import {
  repararTextoUtf8,
} from "../texto-utf8";

interface AjusteMostrable {
  id: string;
  fila: number;
  anioDeclaracion: string;
  numeroDeclaracion: string;
  placa: string;
  numeroSerie: string;
  camposCompletados: string[];
  documentoEnmascarado: string;
  nombreRecuperado: string;
  filaFuente: number;
  anioDeclaracionFuente: string;
  numeroDeclaracionFuente: string;
  metodo: string;
  mensaje: string;
}

interface Props {
  ajustes:
    readonly AjusteMostrable[];
}

function campoVisible(
  campo: string,
): string {
  if (campo === "DNI_RUC") {
    return "DNI/RUC";
  }

  if (
    campo ===
    "NOMBRE_RAZON_SOCIAL"
  ) {
    return "Nombre o razón social";
  }

  return campo.replaceAll(
    "_",
    " ",
  );
}

function mensajeAdvertencia(
  ajuste: AjusteMostrable,
): string {
  const faltaDocumento =
    ajuste.camposCompletados.includes(
      "DNI_RUC",
    );

  const faltaNombre =
    ajuste.camposCompletados.includes(
      "NOMBRE_RAZON_SOCIAL",
    );

  if (faltaDocumento && faltaNombre) {
    return "El DNI/RUC está vacío o no es válido y el nombre o razón social está vacío.";
  }

  if (faltaDocumento) {
    return "El DNI/RUC está vacío o no es válido.";
  }

  if (faltaNombre) {
    return "El nombre o razón social está vacío.";
  }

  return "Se detectó un dato de identidad incompleto.";
}

export default function AjustesAutomaticosDetalle({
  ajustes,
}: Props) {
  if (ajustes.length === 0) {
    return null;
  }

  return (
    <>
      <section className="advertencias-identidad-detectadas">
        <header>
          <div>
            <span>
              Validación del archivo original
            </span>
            <h4>
              Advertencias detectadas
            </h4>
          </div>

          <strong>
            {ajustes.length}
          </strong>
        </header>

        <p className="advertencias-identidad-explicacion">
          Estos datos estaban vacíos o no eran válidos en el archivo recibido.
          Ya no bloquean la versión porque el sistema aplicará un ajuste controlado,
          pero deben revisarse antes de confirmar la importación.
        </p>

        <div className="advertencias-identidad-lista">
          {ajustes.map((ajuste) => (
            <p key={`ADVERTENCIA-${ajuste.id}`}>
              <strong>Fila {ajuste.fila}:</strong>{" "}
              {mensajeAdvertencia(ajuste)}
            </p>
          ))}
        </div>
      </section>

      <section className="ajustes-automaticos-detalle">
        <header>
          <div>
            <span>
              Transparencia de la validación
            </span>
            <h4>
              Ajustes automáticos realizados
            </h4>
          </div>

          <strong>
            {ajustes.length}
          </strong>
        </header>

        <p className="ajustes-automaticos-explicacion">
          El sistema primero intenta recuperar datos de identidad mediante una
          coincidencia única por placa y número de serie. Cuando no existe una
          coincidencia segura, asigna los marcadores SIN DNI/RUC y/o SIN RZ para
          permitir la importación sin ocultar que el dato faltaba en la fuente.
          Revisa cada caso antes de aceptar.
        </p>

        <div className="ajustes-automaticos-tabla-contenedor">
          <table className="ajustes-automaticos-tabla">
            <thead>
              <tr>
                <th>Fila</th>
                <th>Declaración</th>
                <th>Vehículo</th>
                <th>Campos completados</th>
                <th>Dato aplicado</th>
                <th>Fuente / método</th>
                <th>Motivo</th>
              </tr>
            </thead>

            <tbody>
              {ajustes.map(
                (ajuste) => (
                  <tr key={ajuste.id}>
                    <td>
                      {ajuste.fila}
                    </td>

                    <td>
                      <strong>
                        {ajuste.anioDeclaracion}-
                        {ajuste.numeroDeclaracion}
                      </strong>
                    </td>

                    <td>
                      <strong>
                        {ajuste.placa ||
                          "Sin placa"}
                      </strong>
                      <small>
                        Serie:{" "}
                        {ajuste.numeroSerie ||
                          "Sin serie"}
                      </small>
                    </td>

                    <td>
                      {ajuste
                        .camposCompletados
                        .map(campoVisible)
                        .join(", ")}
                    </td>

                    <td>
                      <strong>
                        {ajuste.documentoEnmascarado ||
                          "Documento no completado"}
                      </strong>
                      <small>
                        {ajuste.nombreRecuperado ||
                          "Nombre no completado"}
                      </small>
                    </td>

                    <td>
                      {ajuste.metodo ===
                      "MARCADOR_DATO_FALTANTE" ? (
                        <>
                          <strong>Marcador controlado</strong>
                          <small>Sin fuente de identidad segura</small>
                        </>
                      ) : (
                        <>
                          <strong>
                            Fila {ajuste.filaFuente}
                          </strong>
                          <small>
                            Declaración{" "}
                            {ajuste.anioDeclaracionFuente}-
                            {ajuste.numeroDeclaracionFuente}
                          </small>
                        </>
                      )}
                    </td>

                    <td>
                      {repararTextoUtf8(
                        ajuste.mensaje,
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
