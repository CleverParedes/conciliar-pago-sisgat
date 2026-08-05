import {
  useEffect,
  useState,
} from "react";
import type {
  RolSesion,
} from "../types";

export type SeccionApp =
  | "inicio"
  | "liquidaciones"
  | "requerimientos"
  | "requerimientos-manuales"
  | "actualizacion"
  | "historial"
  | "reportes"
  | "configuracion";

interface SidebarProps {
  abierto: boolean;
  rol: RolSesion;
  seccionActiva: SeccionApp;
  cambiarSeccion: (
    seccion: SeccionApp,
  ) => void;
}

interface IconoProps {
  nombre: SeccionApp;
}

function Icono({
  nombre,
}: IconoProps) {
  const propiedades = {
    width: 21,
    height: 21,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap:
      "round" as const,
    strokeLinejoin:
      "round" as const,
    "aria-hidden": true,
  };

  switch (nombre) {
    case "liquidaciones":
      return (
        <svg {...propiedades}>
          <path d="M6 3h12v18H6z" />
          <path d="M9 7h6" />
          <path d="M9 11h6" />
          <path d="M9 15h3" />
        </svg>
      );

    case "requerimientos":
      return (
        <svg {...propiedades}>
          <path d="M7 4h10" />
          <path d="M9 2h6v4H9z" />
          <path d="M6 4H4v18h16V4h-2" />
          <path d="M8 10h8" />
          <path d="M8 14h8" />
          <path d="M8 18h5" />
        </svg>
      );

    case "requerimientos-manuales":
      return (
        <svg {...propiedades}>
          <path d="M4 4h16v16H4z" />
          <path d="M8 8h8" />
          <path d="M8 12h5" />
          <path d="m14 17 4-4 2 2-4 4h-2z" />
        </svg>
      );

    case "actualizacion":
      return (
        <svg {...propiedades}>
          <path d="M12 3v12" />
          <path d="m7 8 5-5 5 5" />
          <path d="M5 15v4h14v-4" />
        </svg>
      );

    case "historial":
      return (
        <svg {...propiedades}>
          <path d="M3 12a9 9 0 1 0 3-6.7" />
          <path d="M3 4v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      );

    case "reportes":
      return (
        <svg {...propiedades}>
          <path d="M4 19V9" />
          <path d="M10 19V5" />
          <path d="M16 19v-7" />
          <path d="M22 19H2" />
        </svg>
      );

    case "configuracion":
      return (
        <svg {...propiedades}>
          <circle
            cx="12"
            cy="12"
            r="3"
          />

          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
        </svg>
      );

    case "inicio":
    default:
      return (
        <svg {...propiedades}>
          <path d="m3 11 9-8 9 8" />
          <path d="M5 10v10h14V10" />
          <path d="M9 20v-6h6v6" />
        </svg>
      );
  }
}

interface ElementoMenu {
  id: SeccionApp;
  etiqueta: string;
  descripcion: string;
  soloAdministrador?: boolean;
}


const MENU_GESTION_OPERATIVA:
ElementoMenu[] = [
  {
    id: "requerimientos-manuales",
    etiqueta:
      "Requerimientos manuales",
    descripcion:
      "Seguimiento operativo del Excel",
  },
];

const MENU_OPERACIONES:
ElementoMenu[] = [
  {
    id: "actualizacion",
    etiqueta:
      "Actualización de datos",
    descripcion:
      "Importar órdenes y pagos",
    soloAdministrador: true,
  },
  {
    id: "historial",
    etiqueta:
      "Historial de cargas",
    descripcion:
      "Archivos procesados",
    soloAdministrador: true,
  },
];

const MENU_RESULTADOS:
ElementoMenu[] = [
  {
    id: "reportes",
    etiqueta: "Reportes",
    descripcion:
      "Exportaciones y resultados",
  },
  {
    id: "configuracion",
    etiqueta: "Configuración",
    descripcion:
      "Opciones del sistema",
    soloAdministrador: true,
  },
];

interface GrupoMenuProps {
  titulo: string;
  elementos: ElementoMenu[];
  abierto: boolean;
  rol: RolSesion;
  seccionActiva: SeccionApp;
  cambiarSeccion: (
    seccion: SeccionApp,
  ) => void;
}

function GrupoMenu({
  titulo,
  elementos,
  abierto,
  rol,
  seccionActiva,
  cambiarSeccion,
}: GrupoMenuProps) {
  const elementosVisibles =
    elementos.filter(
      (elemento) =>
        !elemento
          .soloAdministrador ||
        rol ===
          "ADMINISTRADOR",
    );

  if (
    elementosVisibles.length ===
    0
  ) {
    return null;
  }

  return (
    <section className="sidebar-grupo">
      {abierto && (
        <p className="sidebar-grupo-titulo">
          {titulo}
        </p>
      )}

      {elementosVisibles.map(
        (elemento) => {
          const activo =
            seccionActiva ===
            elemento.id;

          return (
            <button
              key={elemento.id}
              type="button"
              className={`sidebar-item ${
                activo
                  ? "sidebar-item-activo"
                  : ""
              }`}
              onClick={() =>
                cambiarSeccion(
                  elemento.id,
                )
              }
              title={
                abierto
                  ? undefined
                  : elemento.etiqueta
              }
            >
              <span className="sidebar-item-icono">
                <Icono
                  nombre={elemento.id}
                />
              </span>

              {abierto && (
                <span className="sidebar-item-contenido">
                  <strong>
                    {
                      elemento
                        .etiqueta
                    }
                  </strong>

                  <small>
                    {
                      elemento
                        .descripcion
                    }
                  </small>
                </span>
              )}

              {abierto && activo && (
                <span className="sidebar-indicador" />
              )}
            </button>
          );
        },
      )}
    </section>
  );
}

export function Sidebar({
  abierto,
  rol,
  seccionActiva,
  cambiarSeccion,
}: SidebarProps) {
  const [
    inicioAbierto,
    setInicioAbierto,
  ] = useState(true);

  const seccionInicioActiva =
    seccionActiva === "inicio" ||
    seccionActiva ===
      "liquidaciones" ||
    seccionActiva ===
      "requerimientos";

  useEffect(() => {
    if (seccionInicioActiva) {
      setInicioAbierto(true);
    }
  }, [seccionInicioActiva]);

  return (
    <aside
      className={`sidebar ${
        abierto
          ? "sidebar-abierto"
          : "sidebar-colapsado"
      }`}
    >
      <header className="sidebar-marca">
        <div className="sidebar-marca-icono">
          CP
        </div>

        {abierto && (
          <div className="sidebar-marca-texto">
            <strong>
              Conciliación de pagos
            </strong>

            <span>
              Gestión tributaria
            </span>
          </div>
        )}
      </header>

      <nav className="sidebar-menu">
        <section className="sidebar-grupo">
          {abierto && (
            <p className="sidebar-grupo-titulo">
              Consultas
            </p>
          )}

          <button
            type="button"
            className={`sidebar-item ${
              seccionInicioActiva
                ? "sidebar-item-activo"
                : ""
            }`}
            onClick={() => {
              if (!abierto) {
                cambiarSeccion(
                  "inicio",
                );
                return;
              }

              setInicioAbierto(
                (actual) =>
                  !actual,
              );
            }}
            title={
              abierto
                ? undefined
                : "Inicio"
            }
            aria-expanded={
              abierto
                ? inicioAbierto
                : undefined
            }
          >
            <span className="sidebar-item-icono">
              <Icono nombre="inicio" />
            </span>

            {abierto && (
              <>
                <span className="sidebar-item-contenido">
                  <strong>Inicio</strong>

                  <small>
                    Órdenes, liquidaciones
                    y requerimientos
                  </small>
                </span>

                <span
                  className={`sidebar-desplegable-flecha ${
                    inicioAbierto
                      ? "sidebar-desplegable-flecha-abierta"
                      : ""
                  }`}
                >
                  ›
                </span>
              </>
            )}
          </button>

          {abierto &&
            inicioAbierto && (
              <div className="sidebar-submenu">
                <button
                  type="button"
                  className={`sidebar-submenu-item ${
                    seccionActiva ===
                    "inicio"
                      ? "sidebar-submenu-item-activo"
                      : ""
                  }`}
                  onClick={() =>
                    cambiarSeccion(
                      "inicio",
                    )
                  }
                >
                  <span />
                  <div>
                    <strong>
                      Órdenes y pagos
                    </strong>
                    <small>
                      Consulta tributaria
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`sidebar-submenu-item ${
                    seccionActiva ===
                    "liquidaciones"
                      ? "sidebar-submenu-item-activo"
                      : ""
                  }`}
                  onClick={() =>
                    cambiarSeccion(
                      "liquidaciones",
                    )
                  }
                >
                  <span />
                  <div>
                    <strong>
                      Liquidaciones y
                      pagos
                    </strong>
                    <small>
                      Consulta tributaria
                    </small>
                  </div>
                </button>

                <button
                  type="button"
                  className={`sidebar-submenu-item ${
                    seccionActiva ===
                    "requerimientos"
                      ? "sidebar-submenu-item-activo"
                      : ""
                  }`}
                  onClick={() =>
                    cambiarSeccion(
                      "requerimientos",
                    )
                  }
                >
                  <span />
                  <div>
                    <strong>
                      Requerimientos
                      SisGAT y pagos
                    </strong>
                    <small>
                      Consulta tributaria
                    </small>
                  </div>
                </button>
              </div>
            )}
        </section>

        <GrupoMenu
          titulo="Gestión operativa"
          elementos={
            MENU_GESTION_OPERATIVA
          }
          abierto={abierto}
          rol={rol}
          seccionActiva={
            seccionActiva
          }
          cambiarSeccion={
            cambiarSeccion
          }
        />

        <GrupoMenu
          titulo="Operaciones"
          elementos={
            MENU_OPERACIONES
          }
          abierto={abierto}
          rol={rol}
          seccionActiva={
            seccionActiva
          }
          cambiarSeccion={
            cambiarSeccion
          }
        />

        <GrupoMenu
          titulo="Resultados"
          elementos={
            MENU_RESULTADOS
          }
          abierto={abierto}
          rol={rol}
          seccionActiva={
            seccionActiva
          }
          cambiarSeccion={
            cambiarSeccion
          }
        />
      </nav>

      <footer className="sidebar-estado-db">
        <span className="sidebar-db-punto" />

        {abierto && (
          <div>
            <strong>
              PostgreSQL
            </strong>

            <small>
              Base de datos conectada
            </small>
          </div>
        )}
      </footer>
    </aside>
  );
}
