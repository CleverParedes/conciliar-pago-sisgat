import {
  useEffect,
  useState,
} from "react";

import ActualizacionLiquidaciones from "../components/ActualizacionLiquidaciones";
import ActualizacionRequerimientosSisgat from "../components/ActualizacionRequerimientosSisgat";
import ActualizacionRequerimientosManualesCarga from "../components/ActualizacionRequerimientosManualesCarga";
import ActualizacionOrdenes from "../components/ActualizacionOrdenes";
import ActualizacionPagosSisgat from "../components/ActualizacionPagosSisgat";

import {
  obtenerResumenCentroActualizacion,
} from "../api";

import type {
  FuenteCentroActualizacion,
  ResumenCentroActualizacion,
} from "../types";

function formatearFecha(
  valor: string | null,
): string {
  if (!valor) {
    return "Sin registro";
  }

  const fecha = new Date(valor);

  if (
    Number.isNaN(
      fecha.getTime(),
    )
  ) {
    return "Fecha no válida";
  }

  return new Intl.DateTimeFormat(
    "es-PE",
    {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone:
        "America/Lima",
    },
  ).format(fecha);
}

interface TarjetaFuenteProps {
  titulo: string;
  descripcion: string;
  fuente:
    FuenteCentroActualizacion;
  tono:
    | "azul"
    | "verde"
    | "morado"
    | "ambar"
    | "gris";
  estadoFlujo:
    | "DISPONIBLE"
    | "SIGUIENTE_ETAPA";
}

function TarjetaFuente({
  titulo,
  descripcion,
  fuente,
  tono,
  estadoFlujo,
}: TarjetaFuenteProps) {
  return (
    <article
      className={`centro-fuente centro-fuente-${tono}`}
    >
      <header>
        <div>
          <span className="centro-fuente-tipo">
            {fuente.versionCompartida
              ? "Versión compartida heredada"
              : "Versión independiente"}
          </span>

          <h3>{titulo}</h3>
        </div>

        <span
          className={
            fuente.disponible
              ? "centro-version centro-version-activa"
              : "centro-version centro-version-vacia"
          }
        >
          {fuente.disponible
            ? `Versión #${fuente.versionId}`
            : "Sin versión activa"}
        </span>
      </header>

      <p>{descripcion}</p>

      <dl className="centro-fuente-metricas">
        <div>
          <dt>
            {fuente.etiquetaPrincipal ??
              "Registros"}
          </dt>

          <dd>
            {fuente.disponible
              ? fuente.totalPrincipal ?? 0
              : "—"}
          </dd>
        </div>

        <div>
          <dt>
            {fuente.etiquetaSecundaria ??
              "Complementarios"}
          </dt>

          <dd>
            {fuente.disponible &&
            fuente.totalSecundario !==
              null &&
            fuente.totalSecundario !==
              undefined
              ? fuente.totalSecundario
              : "—"}
          </dd>
        </div>
      </dl>

      <footer>
        <div>
          <span>Última aplicación</span>

          <strong>
            {fuente.disponible
              ? formatearFecha(
                  fuente.fechaAplicacion ??
                    null,
                )
              : "Sin registro"}
          </strong>
        </div>

        <span
          className={
            estadoFlujo ===
            "DISPONIBLE"
              ? "centro-flujo centro-flujo-disponible"
              : "centro-flujo centro-flujo-proximo"
          }
        >
          {estadoFlujo ===
          "DISPONIBLE"
            ? "Carga disponible"
            : "Se integrará después"}
        </span>
      </footer>
    </article>
  );
}

export default function ActualizacionDatos() {
  const [
    resumenCentro,
    setResumenCentro,
  ] =
    useState<ResumenCentroActualizacion | null>(
      null,
    );

  const [
    cargandoCentro,
    setCargandoCentro,
  ] = useState(true);

  const [
    errorCentro,
    setErrorCentro,
  ] =
    useState<string | null>(
      null,
    );

  async function cargarCentro():
  Promise<void> {
    try {
      setCargandoCentro(true);
      setErrorCentro(null);

      const resumen =
        await obtenerResumenCentroActualizacion();

      setResumenCentro(resumen);
    } catch (error) {
      setErrorCentro(
        error instanceof Error
          ? error.message
          : "No se pudo cargar el centro de actualización.",
      );
    } finally {
      setCargandoCentro(false);
    }
  }

  useEffect(() => {
    void cargarCentro();
  }, []);

  return (
    <main className="pagina-actualizacion">
      <header className="pagina-cabecera">
        <div>
          <p className="pagina-etiqueta">
            Administración
          </p>

          <h1>
            Actualización de datos
          </h1>

          <p>
            Analiza cada fuente antes de reemplazar su versión activa.
          </p>
        </div>

        <div className="estado-servicio">
          <span />
          Backend conectado
        </div>
      </header>

      <section className="centro-actualizacion">
        <header className="centro-actualizacion-cabecera">
          <div>
            <p className="pagina-etiqueta">
              Fuentes de información
            </p>

            <h2>
              Centro de actualización
            </h2>

            <p>
              Órdenes y Pagos SisGAT ya se actualizan de forma independiente.
              Las cinco fuentes cuentan con actualización independiente, respaldo y control de versiones.
            </p>
          </div>

          <div className="centro-leyenda">
            <span>
              <i className="centro-punto centro-punto-activo" />
              Versión activa
            </span>

            <span>
              <i className="centro-punto centro-punto-proximo" />
              Flujo pendiente
            </span>
          </div>
        </header>

        {errorCentro && (
          <div className="centro-cargando centro-cargando-error">
            {errorCentro}
          </div>
        )}

        {cargandoCentro ? (
          <div className="centro-cargando">
            Consultando versiones activas…
          </div>
        ) : resumenCentro ? (
          <div className="centro-fuentes-grid">
            <TarjetaFuente
              titulo="Declaraciones y pagos SisGAT"
              descripcion="Fuente independiente compartida por Órdenes, Liquidaciones y ambos módulos de Requerimientos."
              fuente={
                resumenCentro
                  .pagosSisgat
              }
              tono="azul"
              estadoFlujo="DISPONIBLE"
            />

            <TarjetaFuente
              titulo="Órdenes de pago"
              descripcion="Fuente independiente conciliada contra las declaraciones y recibos SisGAT activos."
              fuente={
                resumenCentro.ordenes
              }
              tono="verde"
              estadoFlujo="DISPONIBLE"
            />

            <TarjetaFuente
              titulo="Liquidaciones"
              descripcion="Fuente independiente con análisis, respaldo, confirmación y conciliación desde esta pantalla."
              fuente={
                resumenCentro
                  .liquidaciones
              }
              tono="morado"
              estadoFlujo="DISPONIBLE"
            />

            <TarjetaFuente
              titulo="Requerimientos SisGAT"
              descripcion="Fuente oficial independiente con análisis, respaldo, confirmación y conciliación desde esta pantalla."
              fuente={
                resumenCentro
                  .requerimientosSisgat
              }
              tono="ambar"
              estadoFlujo="DISPONIBLE"
            />

            <TarjetaFuente
              titulo="Requerimientos manuales"
              descripcion="Excel operativo independiente con respaldo, reemplazo completo y conciliación automática."
              fuente={
                resumenCentro
                  .requerimientosManuales
              }
              tono="gris"
              estadoFlujo="DISPONIBLE"
            />
          </div>
        ) : null}

        <aside className="centro-aviso-arquitectura">
          <strong>
            El flujo conjunto anterior queda retirado de esta pantalla
          </strong>

          <p>
            Actualizar Pagos SisGAT no elimina Órdenes. Actualizar Órdenes no
            elimina declaraciones, recibos, Liquidaciones ni Requerimientos.
            Cada confirmación crea primero un respaldo completo de PostgreSQL.
          </p>
        </aside>
      </section>

      <ActualizacionPagosSisgat
        alActualizar={cargarCentro}
      />

      <ActualizacionOrdenes
        alActualizar={cargarCentro}
      />

      <ActualizacionLiquidaciones
        alActualizar={cargarCentro}
      />

      <ActualizacionRequerimientosSisgat
        alActualizar={cargarCentro}
      />

      <ActualizacionRequerimientosManualesCarga
        alActualizar={cargarCentro}
      />
    </main>
  );
}
