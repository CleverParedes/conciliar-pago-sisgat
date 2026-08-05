import "../versiones-pendientes.css";

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

export default function AjustesAutomaticosDetalle({
  ajustes,
}: Props) {
  if (ajustes.length === 0) {
    return null;
  }

  return (
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
        El sistema completó datos de
        identidad únicamente cuando
        encontró una coincidencia única
        por placa y número de serie.
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
              <th>Dato recuperado</th>
              <th>Fuente utilizada</th>
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
                    <strong>
                      Fila {ajuste.filaFuente}
                    </strong>
                    <small>
                      Declaración{" "}
                      {ajuste.anioDeclaracionFuente}-
                      {ajuste.numeroDeclaracionFuente}
                    </small>
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
  );
}
