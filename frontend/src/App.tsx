import {
  useEffect,
  useState,
} from "react";

import {
  Sidebar,
  type SeccionApp,
} from "./components/Sidebar";

import {
  cerrarSesion,
  ingresarComoInvitado,
  iniciarSesion,
  obtenerSesionActual,
} from "./api";

import ActualizacionDatos from "./pages/ActualizacionDatos";
import ConfiguracionUsuarios from "./pages/ConfiguracionUsuarios";
import Dashboard from "./pages/Dashboard";
import HistorialVersiones from "./pages/HistorialVersiones";
import Liquidaciones from "./pages/Liquidaciones";
import Requerimientos from "./pages/Requerimientos";
import RequerimientosManuales from "./pages/RequerimientosManuales";
import Login from "./pages/Login";
import Reportes from "./pages/Reportes";

import type {
  SesionActual,
} from "./types";

function obtenerSaludo(): string {
  const hora =
    new Date().getHours();

  if (hora < 12) {
    return "Buenos días";
  }

  if (hora < 19) {
    return "Buenas tardes";
  }

  return "Buenas noches";
}

function App() {
  const [
    verificandoSesion,
    setVerificandoSesion,
  ] = useState(true);

  const [
    sesion,
    setSesion,
  ] = useState<
    SesionActual | null
  >(null);

  const [
    sidebarAbierto,
    setSidebarAbierto,
  ] = useState(true);

  const [
    seccionActiva,
    setSeccionActiva,
  ] = useState<SeccionApp>(
    "inicio",
  );

  useEffect(() => {
    let componenteActivo = true;

    async function verificar():
    Promise<void> {
      try {
        const sesionEncontrada =
          await obtenerSesionActual();

        if (componenteActivo) {
          setSesion(
            sesionEncontrada,
          );
        }
      } catch (error) {
        console.error(
          "No se pudo verificar la sesión.",
          error,
        );

        if (componenteActivo) {
          setSesion(null);
        }
      } finally {
        if (componenteActivo) {
          setVerificandoSesion(
            false,
          );
        }
      }
    }

    void verificar();

    return () => {
      componenteActivo = false;
    };
  }, []);

  useEffect(() => {
    function manejarSesionExpirada():
    void {
      setSesion(null);
      setSeccionActiva("inicio");
    }

    window.addEventListener(
      "sesion-expirada",
      manejarSesionExpirada,
    );

    return () => {
      window.removeEventListener(
        "sesion-expirada",
        manejarSesionExpirada,
      );
    };
  }, []);

  async function acceder(
    identificador: string,
    password: string,
  ): Promise<SesionActual> {
    const nuevaSesion =
      await iniciarSesion({
        identificador,
        password,
      });

    setSesion(nuevaSesion);
    setSeccionActiva("inicio");

    return nuevaSesion;
  }

  async function accederInvitado():
  Promise<SesionActual> {
    const nuevaSesion =
      await ingresarComoInvitado();

    setSesion(nuevaSesion);
    setSeccionActiva("inicio");

    return nuevaSesion;
  }

  async function salir():
  Promise<void> {
    try {
      await cerrarSesion();
    } catch (error) {
      console.error(
        "No se pudo cerrar la sesión en el servidor.",
        error,
      );
    } finally {
      setSesion(null);
      setSeccionActiva("inicio");
    }
  }

  function cambiarSeccion(
    seccion: SeccionApp,
  ): void {
    const esAdministrador =
      sesion?.rol ===
      "ADMINISTRADOR";

    const esRestringida =
      seccion ===
        "actualizacion" ||
      seccion === "historial" ||
      seccion ===
        "configuracion";

    if (
      esRestringida &&
      !esAdministrador
    ) {
      return;
    }

    setSeccionActiva(seccion);
  }

  function renderizarPagina() {
    switch (seccionActiva) {
      case "liquidaciones":
        return <Liquidaciones />;

      case "requerimientos":
        return <Requerimientos />;

      case "requerimientos-manuales":
        return (
          <RequerimientosManuales
            rol={sesion?.rol ?? "INVITADO"}
          />
        );

      case "actualizacion":
        return (
          <ActualizacionDatos />
        );

      case "historial":
        return (
          <HistorialVersiones />
        );

      case "reportes":
        return <Reportes />;

      case "configuracion":
        return (
          <ConfiguracionUsuarios
            usuarioActualId={
              sesion?.usuario?.id ??
              0
            }
          />
        );

      case "inicio":
      default:
        return <Dashboard />;
    }
  }

  if (verificandoSesion) {
    return (
      <main className="sesion-cargando">
        <div className="sesion-spinner" />

        <strong>
          Verificando sesión
        </strong>

        <span>
          Espera un momento...
        </span>
      </main>
    );
  }

  if (!sesion) {
    return (
      <Login
        iniciarSesion={acceder}
        ingresarInvitado={
          accederInvitado
        }
      />
    );
  }

  const nombreVisible =
    sesion.usuario?.nombre ??
    "Invitado";

  const detalleRol =
    sesion.rol ===
    "ADMINISTRADOR"
      ? "Administrador"
      : sesion.rol === "USUARIO"
        ? "Usuario"
        : "Acceso de invitado";

  const inicial =
    nombreVisible
      .trim()
      .charAt(0)
      .toUpperCase() || "I";

  return (
    <div className="app-shell">
      <Sidebar
        abierto={sidebarAbierto}
        rol={sesion.rol}
        seccionActiva={
          seccionActiva
        }
        cambiarSeccion={
          cambiarSeccion
        }
      />

      <div className="app-area">
        <header className="barra-superior">
          <button
            className="boton-menu"
            type="button"
            onClick={() =>
              setSidebarAbierto(
                (estadoActual) =>
                  !estadoActual,
              )
            }
            aria-label={
              sidebarAbierto
                ? "Ocultar menú lateral"
                : "Mostrar menú lateral"
            }
            title={
              sidebarAbierto
                ? "Ocultar menú"
                : "Mostrar menú"
            }
          >
            ☰
          </button>

          <div className="barra-saludo">
            <span>
              {obtenerSaludo()},
            </span>

            <strong>
              {nombreVisible}
            </strong>
          </div>

          <div className="barra-usuario">
            <div>
              <strong>
                {nombreVisible}
              </strong>

              <span>
                {detalleRol}
              </span>
            </div>

            <div className="barra-avatar">
              {inicial}
            </div>

            <button
              className="boton-cerrar-sesion"
              type="button"
              onClick={() =>
                void salir()
              }
            >
              Cerrar sesión
            </button>
          </div>
        </header>

        <section className="contenido-pagina">
          {renderizarPagina()}
        </section>
      </div>
    </div>
  );
}

export default App;
