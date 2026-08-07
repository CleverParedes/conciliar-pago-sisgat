import AjustesAutomaticosDetalle from "./AjustesAutomaticosDetalle";
import { repararTextoUtf8 } from "../texto-utf8";
import VersionPendienteFuente from "./VersionPendienteFuente";
import {
  useEffect,
  useState,
  type FormEvent,
} from "react";

import {
  analizarVersionPagosSisgat,
  confirmarVersionPagosSisgat,
  probarArchivoSinAplicar,
} from "../api";
import type {
  ResultadoAnalisisPagosSisgat,
  ResultadoConfirmacionPagosSisgat,
} from "../types";

interface Props {
  alActualizar: () =>
    Promise<void> | void;
}

function mensajeError(
  error: unknown,
): string {
  return error instanceof Error
    ? repararTextoUtf8(error.message)
    : "Ocurrió un error inesperado.";
}

function duracion(
  segundos: number,
): string {
  return (
    `${String(
      Math.floor(segundos / 60),
    ).padStart(2, "0")}:` +
    String(segundos % 60)
      .padStart(2, "0")
  );
}

export default function ActualizacionPagosSisgat({
  alActualizar,
}: Props) {
  const [archivo, setArchivo] =
    useState<File | null>(null);
  const [comentario, setComentario] =
    useState("");
  const [analizando, setAnalizando] =
    useState(false);
  const [modoPrueba, setModoPrueba] =
    useState(false);
  const [confirmando, setConfirmando] =
    useState(false);
  const [segundos, setSegundos] =
    useState(0);
  const [aceptaAjustes, setAceptaAjustes] =
    useState(false);
  const [modal, setModal] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [mensaje, setMensaje] =
    useState<string | null>(null);
  const [analisis, setAnalisis] =
    useState<ResultadoAnalisisPagosSisgat | null>(
      null,
    );
  const [confirmacion, setConfirmacion] =
    useState<ResultadoConfirmacionPagosSisgat | null>(
      null,
    );

  useEffect(() => {
    if (!confirmando) {
      setSegundos(0);
      return;
    }

    const inicio = Date.now();
    const id = window.setInterval(
      () => {
        setSegundos(
          Math.floor(
            (Date.now() - inicio) /
              1000,
          ),
        );
      },
      1000,
    );

    return () =>
      window.clearInterval(id);
  }, [confirmando]);

  function seleccionar(
    nuevo: File | null,
  ): void {
    setArchivo(nuevo);
    setModoPrueba(false);
    setAnalisis(null);
    setConfirmacion(null);
    setError(null);
    setMensaje(null);
    setAceptaAjustes(false);
  }

  async function analizar(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();
    setError(null);
    setMensaje(null);
    setConfirmacion(null);

    if (!archivo) {
      setError(
        "Selecciona el reporte de declaraciones y pagos SisGAT.",
      );
      return;
    }

    if (
      !/\.(txt|csv)$/i.test(
        archivo.name,
      )
    ) {
      setError(
        "El archivo debe ser TXT o CSV.",
      );
      return;
    }

    if (
      archivo.size >
      25 * 1024 * 1024
    ) {
      setError(
        "El archivo supera el límite de 25 MB.",
      );
      return;
    }

    try {
      setAnalizando(true);
      setModoPrueba(false);
      const resultado =
        await analizarVersionPagosSisgat(
          archivo,
          comentario,
        );

      setAnalisis(resultado);
      setMensaje(
        resultado.puedeConfirmarse
          ? resultado
              .requiereRevisionAjustes
            ? `El archivo es válido. Revisa ${resultado.totalAdvertencias} ajuste(s) automático(s).`
            : "El archivo es válido y está listo para confirmar."
          : "El archivo contiene errores y no puede aplicarse.",
      );
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setAnalizando(false);
    }
  }

  async function probarArchivo(): Promise<void> {
    setError(null);
    setMensaje(null);
    setConfirmacion(null);
    setAceptaAjustes(false);

    if (!archivo) {
      setError("Selecciona el reporte de declaraciones y pagos SisGAT.");
      return;
    }

    if (!/\.(txt|csv)$/i.test(archivo.name)) {
      setError("El archivo debe ser TXT o CSV.");
      return;
    }

    if (archivo.size > 25 * 1024 * 1024) {
      setError("El archivo supera el límite de 25 MB.");
      return;
    }

    try {
      setAnalizando(true);
      setModoPrueba(true);

      const resultado =
        await probarArchivoSinAplicar<ResultadoAnalisisPagosSisgat>(
          "/versiones-pagos-sisgat/probar",
          "archivo",
          archivo,
        );

      setAnalisis(resultado);
      setMensaje(
        resultado.puedeConfirmarse
          ? resultado.requiereRevisionAjustes
            ? `Prueba válida: se detectaron ${resultado.totalAdvertencias} ajuste(s) automático(s). No se guardó nada.`
            : "Prueba válida: no se detectaron errores. No se creó ninguna versión ni se modificaron datos."
          : `Prueba completada: se detectaron ${resultado.totales.errores} fila(s) con error. No se modificaron datos.`,
      );
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setAnalizando(false);
    }
  }

  function solicitarConfirmacion(): void {
    if (
      modoPrueba ||
      !analisis?.puedeConfirmarse
    ) {
      return;
    }

    if (
      analisis
        .requiereRevisionAjustes &&
      !aceptaAjustes
    ) {
      setError(
        "Revisa y acepta los ajustes automáticos antes de confirmar.",
      );
      return;
    }

    setError(null);
    setModal(true);
  }

  async function confirmar():
  Promise<void> {
    if (!analisis) {
      return;
    }

    try {
      setModal(false);
      setConfirmando(true);
      setError(null);
      setMensaje(null);

      const resultado =
        await confirmarVersionPagosSisgat(
          analisis.id,
          aceptaAjustes,
        );

      setConfirmacion(resultado);
      setMensaje(
        "Los pagos fueron actualizados y los cuatro módulos se recalcularon correctamente.",
      );
      await alActualizar();
    } catch (e) {
      setError(mensajeError(e));
    } finally {
      setConfirmando(false);
    }
  }

  function limpiar(): void {
    seleccionar(null);
    setComentario("");
    const input =
      document.getElementById(
        "archivo-pagos-sisgat-independiente",
      ) as HTMLInputElement | null;

    if (input) {
      input.value = "";
    }
  }

  return (
    <section className="pagos-independientes">
      <VersionPendienteFuente
        fuente="pagos"
        alAplicar={alActualizar}
      />
      <header className="pagos-independientes-cabecera">
        <div>
          <h2>
            Actualización independiente de Pagos SisGAT
          </h2>
          <p>
            Reemplaza solamente declaraciones y recibos. Las órdenes,
            liquidaciones y requerimientos se conservan y se vuelven a
            conciliar automáticamente.
          </p>
        </div>
        <span className="pagos-independientes-listo">
          Flujo recomendado
        </span>
      </header>

      <div className="pagos-impacto">
        <span>Recalcula</span>
        <strong>Órdenes</strong>
        <strong>Liquidaciones</strong>
        <strong>Requerimientos SisGAT</strong>
        <strong>Requerimientos manuales</strong>
      </div>

      {error && (
        <div className="pagos-mensaje pagos-mensaje-error">
          <strong>Atención</strong>
          <span>{repararTextoUtf8(error)}</span>
        </div>
      )}

      {mensaje && (
        <div className="pagos-mensaje pagos-mensaje-info">
          <strong>
            {confirmacion
              ? "Actualización completada"
              : modoPrueba
                ? "Prueba finalizada"
                : "Análisis finalizado"}
          </strong>
          <span>{repararTextoUtf8(mensaje)}</span>
        </div>
      )}

      <form
        className="pagos-independientes-formulario"
        onSubmit={(evento) =>
          void analizar(evento)
        }
      >
        <label className="pagos-selector">
          <input
            id="archivo-pagos-sisgat-independiente"
            type="file"
            accept=".txt,.csv,text/plain,text/csv"
            onChange={(evento) =>
              seleccionar(
                evento.target
                  .files?.[0] ??
                  null,
              )
            }
          />
          <span className="pagos-selector-icono">↑</span>
          <strong>
            {archivo
              ? archivo.name
              : "Seleccionar reporte de pagos SisGAT"}
          </strong>
          <small>
            Un solo archivo TXT o CSV · máximo 25 MB
          </small>
        </label>

        <label className="pagos-comentario">
          <span>Comentario de la versión</span>
          <textarea
            value={comentario}
            maxLength={500}
            placeholder="Ejemplo: reporte completo descargado el 4 de agosto de 2026"
            onChange={(evento) =>
              setComentario(
                evento.target.value,
              )
            }
          />
        </label>

        <div className="pagos-acciones">
          <button
            type="button"
            className="boton-ligero"
            onClick={limpiar}
            disabled={
              analizando ||
              confirmando
            }
          >
            Limpiar
          </button>
          <button
            type="button"
            className="boton-ligero"
            disabled={
              analizando ||
              confirmando ||
              !archivo
            }
            onClick={() => void probarArchivo()}
          >
            {analizando && modoPrueba
              ? "Probando…"
              : "Probar archivo"}
          </button>
          <button
            type="submit"
            className="boton-primario"
            disabled={
              analizando ||
              confirmando ||
              !archivo
            }
          >
            {analizando && !modoPrueba
              ? "Analizando…"
              : "Analizar archivo"}
          </button>
        </div>
      </form>

      {analisis && (
        <section className="pagos-analisis">
          <header>
            <div>
              <span>{modoPrueba ? "Análisis de prueba" : "Versión analizada"}</span>
              <h3>{modoPrueba ? "NO GUARDADA" : `#${analisis.id}`}</h3>
            </div>
            <span
              className={
                analisis.puedeConfirmarse
                  ? "pagos-estado pagos-estado-valido"
                  : "pagos-estado pagos-estado-error"
              }
            >
              {modoPrueba
                ? analisis.puedeConfirmarse
                  ? "Prueba válida"
                  : "Prueba con errores"
                : analisis.puedeConfirmarse
                  ? "Lista para confirmar"
                  : "Con errores"}
            </span>
          </header>

          <div className="pagos-analisis-metricas">
            <div>
              <span>Declaraciones</span>
              <strong>
                {analisis.totales.declaraciones}
              </strong>
            </div>
            <div>
              <span>Recibos</span>
              <strong>
                {analisis.totales.recibos}
              </strong>
            </div>
            <div>
              <span>Errores</span>
              <strong>
                {analisis.totales.errores}
              </strong>
            </div>
            <div>
              <span>Ajustes</span>
              <strong>
                {analisis.totalAdvertencias}
              </strong>
            </div>
          </div>

          {analisis.archivo.errores.length > 0 && (
            <div className="pagos-listado-revision">
              <h4>Primeros errores</h4>
              {analisis.archivo.errores
                .slice(0, 10)
                .map((item, indice) => (
                  <p key={`${item.fila}-${indice}`}>
                    Fila {item.fila}: {repararTextoUtf8(item.mensaje)}
                  </p>
                ))}
            </div>
          )}

          {analisis.advertencias.length > 0 && (
            <AjustesAutomaticosDetalle
              ajustes={analisis.advertencias}
            />
          )}

          {analisis.requiereRevisionAjustes && !modoPrueba && (
            <label className="pagos-aceptar-ajustes">
              <input
                type="checkbox"
                checked={aceptaAjustes}
                onChange={(evento) =>
                  setAceptaAjustes(
                    evento.target.checked,
                  )
                }
              />
              <span>
                Revisé los ajustes automáticos de identidad y autorizo
                utilizarlos al importar.
              </span>
            </label>
          )}

          {modoPrueba ? (
            <div className="pagos-mensaje pagos-mensaje-info">
              <strong>Modo de prueba</strong>
              <span>El análisis usó las reglas reales, pero no creó una versión, no guardó el archivo y no modificó PostgreSQL.</span>
            </div>
          ) : (
            <button
              type="button"
              className="boton-primario"
              disabled={
                !analisis.puedeConfirmarse ||
                confirmando
              }
              onClick={
                solicitarConfirmacion
              }
            >
              Confirmar nueva versión de pagos
            </button>
          )}
        </section>
      )}

      {confirmacion && (
        <section className="pagos-confirmacion-resumen">
          <header>
            <div>
              <span>Nueva versión activa</span>
              <h3>#{confirmacion.version.id}</h3>
            </div>
            <strong>Actualización correcta</strong>
          </header>

          <div>
            <article>
              <span>Declaraciones</span>
              <strong>{confirmacion.totales.declaraciones}</strong>
            </article>
            <article>
              <span>Recibos</span>
              <strong>{confirmacion.totales.recibos}</strong>
            </article>
            <article>
              <span>Órdenes conservadas</span>
              <strong>{confirmacion.modulosConservados.ordenes}</strong>
            </article>
            <article>
              <span>Liquidaciones conservadas</span>
              <strong>{confirmacion.modulosConservados.liquidaciones}</strong>
            </article>
            <article>
              <span>Req. SisGAT conservados</span>
              <strong>{confirmacion.modulosConservados.requerimientosSisgat}</strong>
            </article>
            <article>
              <span>Req. manuales conservados</span>
              <strong>{confirmacion.modulosConservados.requerimientosManuales}</strong>
            </article>
          </div>
        </section>
      )}

      {modal && analisis && (
        <div className="modal-actualizacion-fondo">
          <section className="modal-confirmar-actualizacion">
            <div className="modal-confirmar-icono">↻</div>
            <div className="modal-confirmar-contenido">
              <p className="pagina-etiqueta">Confirmación final</p>
              <h2>
                Aplicar versión de pagos #{analisis.id}
              </h2>
              <p>
                Se creará un respaldo completo. Después se reemplazarán
                únicamente las declaraciones y los recibos SisGAT.
              </p>
              <dl className="modal-confirmar-resumen">
                <div>
                  <dt>Declaraciones</dt>
                  <dd>{analisis.totales.declaraciones}</dd>
                </div>
                <div>
                  <dt>Recibos</dt>
                  <dd>{analisis.totales.recibos}</dd>
                </div>
                <div>
                  <dt>Módulos recalculados</dt>
                  <dd>4</dd>
                </div>
                <div>
                  <dt>Órdenes eliminadas</dt>
                  <dd>0</dd>
                </div>
              </dl>
              <div className="modal-confirmar-aviso">
                Mantén la pestaña abierta. El proceso puede tardar varios
                minutos porque vuelve a conciliar todos los módulos.
              </div>
              <div className="modal-confirmar-acciones">
                <button
                  type="button"
                  className="boton-ligero"
                  onClick={() => setModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="boton-primario"
                  onClick={() => void confirmar()}
                >
                  Confirmar y recalcular
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {confirmando && (
        <div className="modal-actualizacion-fondo modal-actualizacion-bloqueado">
          <section className="modal-progreso-actualizacion">
            <div className="progreso-actualizacion-cabecera">
              <span className="progreso-actualizacion-spinner" />
              <div>
                <p className="pagina-etiqueta">Proceso en curso</p>
                <h2>Actualizando Pagos SisGAT</h2>
              </div>
            </div>
            <p>
              Respaldo, importación y conciliación de cuatro módulos.
            </p>
            <div className="barra-progreso-actualizacion">
              <span />
            </div>
            <ol className="etapas-progreso-actualizacion">
              <li><span>1</span><div><strong>Respaldo</strong><small>Protege PostgreSQL.</small></div></li>
              <li><span>2</span><div><strong>Pagos</strong><small>Reemplaza declaraciones y recibos.</small></div></li>
              <li><span>3</span><div><strong>Conciliación</strong><small>Actualiza cuatro módulos.</small></div></li>
            </ol>
            <strong className="tiempo-proceso-actualizacion">
              Tiempo transcurrido: {duracion(segundos)}
            </strong>
          </section>
        </div>
      )}
    </section>
  );
}
