import {
  useState,
  type FormEvent,
} from "react";

import type {
  SesionActual,
} from "../types";

interface LoginProps {
  iniciarSesion: (
    identificador: string,
    password: string,
  ) => Promise<SesionActual>;

  ingresarInvitado: () =>
    Promise<SesionActual>;
}

function obtenerMensajeError(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return (
    "Ocurrió un error inesperado."
  );
}

export default function Login({
  iniciarSesion,
  ingresarInvitado,
}: LoginProps) {
  const [
    identificador,
    setIdentificador,
  ] = useState("");

  const [
    password,
    setPassword,
  ] = useState("");

  const [
    procesando,
    setProcesando,
  ] = useState(false);

  const [
    mensajeError,
    setMensajeError,
  ] = useState<string | null>(
    null,
  );

  async function enviarFormulario(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();

    setMensajeError(null);

    if (
      identificador.trim().length <
      3
    ) {
      setMensajeError(
        "Ingresa tu usuario o correo.",
      );

      return;
    }

    if (!password) {
      setMensajeError(
        "Ingresa tu contraseña.",
      );

      return;
    }

    try {
      setProcesando(true);

      await iniciarSesion(
        identificador.trim(),
        password,
      );
    } catch (error) {
      setMensajeError(
        obtenerMensajeError(error),
      );
    } finally {
      setProcesando(false);
    }
  }

  async function continuarInvitado():
    Promise<void> {
    try {
      setProcesando(true);
      setMensajeError(null);

      await ingresarInvitado();
    } catch (error) {
      setMensajeError(
        obtenerMensajeError(error),
      );
    } finally {
      setProcesando(false);
    }
  }

  return (
    <main className="login-pagina">
      <section className="login-presentacion">
        <div className="login-marca">
          CP
        </div>

        <p className="login-etiqueta">
          Gestión tributaria
        </p>

        <h1>
          Conciliación de pagos
        </h1>

        <p className="login-descripcion">
          Consulta órdenes de pago,
          declaraciones, recibos,
          saldos y estados de
          conciliación desde una sola
          plataforma.
        </p>

        <div className="login-beneficios">
          <div>
            <span>✓</span>

            <p>
              Consulta centralizada de
              órdenes y pagos.
            </p>
          </div>

          <div>
            <span>✓</span>

            <p>
              Acceso seguro según el
              rol asignado.
            </p>
          </div>

          <div>
            <span>✓</span>

            <p>
              Registro de sesiones y
              acciones administrativas.
            </p>
          </div>
        </div>
      </section>

      <section className="login-acceso">
        <div className="login-tarjeta">
          <header>
            <p className="login-etiqueta">
              Acceso al sistema
            </p>

            <h2>
              Iniciar sesión
            </h2>

            <p>
              Ingresa con tu usuario o
              correo electrónico.
            </p>
          </header>

          <form
            className="login-formulario"
            onSubmit={
              enviarFormulario
            }
          >
            <label>
              <span>
                Usuario o correo
              </span>

              <input
                type="text"
                autoComplete="username"
                value={identificador}
                disabled={procesando}
                onChange={(evento) =>
                  setIdentificador(
                    evento.target.value,
                  )
                }
                placeholder="Ejemplo: admin"
              />
            </label>

            <label>
              <span>
                Contraseña
              </span>

              <input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={procesando}
                onChange={(evento) =>
                  setPassword(
                    evento.target.value,
                  )
                }
                placeholder="Ingresa tu contraseña"
              />
            </label>

            {mensajeError && (
              <div
                className="login-error"
                role="alert"
              >
                {mensajeError}
              </div>
            )}

            <button
              className="login-boton-principal"
              type="submit"
              disabled={procesando}
            >
              {procesando
                ? "Procesando..."
                : "Iniciar sesión"}
            </button>
          </form>

          <div className="login-separador">
            <span>
              o
            </span>
          </div>

          <button
            className="login-boton-invitado"
            type="button"
            disabled={procesando}
            onClick={
              continuarInvitado
            }
          >
            Continuar como invitado
          </button>

          <p className="login-aviso">
            Los invitados pueden
            consultar información, pero
            no pueden actualizar la base
            de datos ni administrar
            usuarios.
          </p>
        </div>
      </section>
    </main>
  );
}