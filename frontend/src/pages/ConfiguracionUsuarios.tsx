import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  cambiarEstadoUsuarioAdmin,
  cambiarPasswordUsuarioAdmin,
  cambiarRolUsuarioAdmin,
  crearUsuarioAdmin,
  obtenerUsuariosAdmin,
} from "../api";

import type {
  CrearUsuarioInput,
  EstadoUsuario,
  RolUsuario,
  UsuarioAdministracion,
} from "../types";

interface ConfiguracionUsuariosProps {
  usuarioActualId: number;
}

const FORMULARIO_INICIAL:
CrearUsuarioInput = {
  nombre: "",
  nombreUsuario: "",
  correo: "",
  password: "",
  rol: "USUARIO",
};

function obtenerMensajeError(
  error: unknown,
): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error inesperado.";
}

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

function etiquetaEstado(
  estado: EstadoUsuario,
): string {
  switch (estado) {
    case "BLOQUEADO":
      return "Bloqueado";

    case "DESACTIVADO":
      return "Desactivado";

    case "ACTIVO":
    default:
      return "Activo";
  }
}

export default function ConfiguracionUsuarios({
  usuarioActualId,
}: ConfiguracionUsuariosProps) {
  const [
    usuarios,
    setUsuarios,
  ] = useState<
    UsuarioAdministracion[]
  >([]);

  const [
    formulario,
    setFormulario,
  ] = useState<CrearUsuarioInput>(
    FORMULARIO_INICIAL,
  );

  const [
    cargando,
    setCargando,
  ] = useState(true);

  const [
    procesando,
    setProcesando,
  ] = useState(false);

  const [
    usuarioProcesandoId,
    setUsuarioProcesandoId,
  ] = useState<number | null>(
    null,
  );

  const [
    usuarioPasswordId,
    setUsuarioPasswordId,
  ] = useState<number | null>(
    null,
  );

  const [
    nuevoPassword,
    setNuevoPassword,
  ] = useState("");

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    mensaje,
    setMensaje,
  ] = useState<string | null>(
    null,
  );

  const usuarioPassword =
    useMemo(() => {
      return usuarios.find(
        (usuario) =>
          usuario.id ===
          usuarioPasswordId,
      );
    }, [
      usuarios,
      usuarioPasswordId,
    ]);

  async function cargarUsuarios():
    Promise<void> {
    try {
      setCargando(true);
      setError(null);

      const registros =
        await obtenerUsuariosAdmin();

      setUsuarios(registros);
    } catch (errorEncontrado) {
      setError(
        obtenerMensajeError(
          errorEncontrado,
        ),
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    void cargarUsuarios();
  }, []);

  async function crearUsuario(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();

    setError(null);
    setMensaje(null);

    if (
      formulario.password.length <
      12
    ) {
      setError(
        "La contraseña debe tener como mínimo 12 caracteres.",
      );

      return;
    }

    try {
      setProcesando(true);

      await crearUsuarioAdmin({
        ...formulario,

        correo:
          formulario.correo
            ?.trim() || null,

        nombre:
          formulario.nombre.trim(),

        nombreUsuario:
          formulario.nombreUsuario
            .trim(),
      });

      setFormulario(
        FORMULARIO_INICIAL,
      );

      setMensaje(
        "Usuario creado correctamente.",
      );

      await cargarUsuarios();
    } catch (errorEncontrado) {
      setError(
        obtenerMensajeError(
          errorEncontrado,
        ),
      );
    } finally {
      setProcesando(false);
    }
  }

  async function actualizarEstado(
    usuario: UsuarioAdministracion,
    estado: EstadoUsuario,
  ): Promise<void> {
    if (
      usuario.id ===
        usuarioActualId &&
      estado !== "ACTIVO"
    ) {
      setError(
        "No puedes bloquear o desactivar tu propia cuenta.",
      );

      return;
    }

    try {
      setUsuarioProcesandoId(
        usuario.id,
      );

      setError(null);
      setMensaje(null);

      await cambiarEstadoUsuarioAdmin(
        usuario.id,
        estado,
      );

      setMensaje(
        `Estado de ${usuario.nombreUsuario} actualizado correctamente.`,
      );

      await cargarUsuarios();
    } catch (errorEncontrado) {
      setError(
        obtenerMensajeError(
          errorEncontrado,
        ),
      );
    } finally {
      setUsuarioProcesandoId(
        null,
      );
    }
  }

  async function actualizarRol(
    usuario: UsuarioAdministracion,
    rol: RolUsuario,
  ): Promise<void> {
    if (
      usuario.id ===
        usuarioActualId &&
      rol !== "ADMINISTRADOR"
    ) {
      setError(
        "No puedes retirar tu propio rol de administrador.",
      );

      return;
    }

    try {
      setUsuarioProcesandoId(
        usuario.id,
      );

      setError(null);
      setMensaje(null);

      await cambiarRolUsuarioAdmin(
        usuario.id,
        rol,
      );

      setMensaje(
        `Rol de ${usuario.nombreUsuario} actualizado correctamente.`,
      );

      await cargarUsuarios();
    } catch (errorEncontrado) {
      setError(
        obtenerMensajeError(
          errorEncontrado,
        ),
      );
    } finally {
      setUsuarioProcesandoId(
        null,
      );
    }
  }

  async function restablecerPassword(
    evento: FormEvent,
  ): Promise<void> {
    evento.preventDefault();

    if (!usuarioPassword) {
      return;
    }

    setError(null);
    setMensaje(null);

    if (
      nuevoPassword.length < 12
    ) {
      setError(
        "La nueva contraseña debe tener como mínimo 12 caracteres.",
      );

      return;
    }

    try {
      setUsuarioProcesandoId(
        usuarioPassword.id,
      );

      await cambiarPasswordUsuarioAdmin(
        usuarioPassword.id,
        nuevoPassword,
      );

      setMensaje(
        `Contraseña de ${usuarioPassword.nombreUsuario} actualizada correctamente.`,
      );

      setUsuarioPasswordId(null);
      setNuevoPassword("");

      await cargarUsuarios();
    } catch (errorEncontrado) {
      setError(
        obtenerMensajeError(
          errorEncontrado,
        ),
      );
    } finally {
      setUsuarioProcesandoId(
        null,
      );
    }
  }

  return (
    <main className="pagina-usuarios">
      <header className="pagina-cabecera">
        <div>
          <p className="pagina-etiqueta">
            Configuración
          </p>

          <h1>
            Administración de usuarios
          </h1>

          <p>
            Crea cuentas, asigna roles,
            controla el acceso y
            restablece contraseñas.
          </p>
        </div>

        <button
          className="boton-secundario"
          type="button"
          disabled={cargando}
          onClick={() =>
            void cargarUsuarios()
          }
        >
          Actualizar lista
        </button>
      </header>

      {error && (
        <div
          className="usuarios-mensaje usuarios-mensaje-error"
          role="alert"
        >
          {error}

          <button
            type="button"
            onClick={() =>
              setError(null)
            }
          >
            ×
          </button>
        </div>
      )}

      {mensaje && (
        <div className="usuarios-mensaje usuarios-mensaje-correcto">
          {mensaje}

          <button
            type="button"
            onClick={() =>
              setMensaje(null)
            }
          >
            ×
          </button>
        </div>
      )}

      <section className="usuarios-panel-crear">
        <header>
          <h2>
            Crear nuevo usuario
          </h2>

          <p>
            La contraseña inicial debe
            tener al menos 12
            caracteres.
          </p>
        </header>

        <form
          className="usuarios-formulario"
          onSubmit={crearUsuario}
        >
          <label className="campo">
            <span>
              Nombre completo
            </span>

            <input
              type="text"
              required
              minLength={3}
              maxLength={150}
              disabled={procesando}
              value={
                formulario.nombre
              }
              onChange={(evento) =>
                setFormulario(
                  (actual) => ({
                    ...actual,
                    nombre:
                      evento.target
                        .value,
                  }),
                )
              }
            />
          </label>

          <label className="campo">
            <span>
              Nombre de usuario
            </span>

            <input
              type="text"
              required
              minLength={3}
              maxLength={80}
              disabled={procesando}
              value={
                formulario
                  .nombreUsuario
              }
              onChange={(evento) =>
                setFormulario(
                  (actual) => ({
                    ...actual,
                    nombreUsuario:
                      evento.target
                        .value,
                  }),
                )
              }
            />
          </label>

          <label className="campo">
            <span>
              Correo electrónico
            </span>

            <input
              type="email"
              disabled={procesando}
              value={
                formulario.correo ??
                ""
              }
              onChange={(evento) =>
                setFormulario(
                  (actual) => ({
                    ...actual,
                    correo:
                      evento.target
                        .value,
                  }),
                )
              }
            />
          </label>

          <label className="campo">
            <span>
              Rol
            </span>

            <select
              disabled={procesando}
              value={formulario.rol}
              onChange={(evento) =>
                setFormulario(
                  (actual) => ({
                    ...actual,
                    rol:
                      evento.target
                        .value as
                        RolUsuario,
                  }),
                )
              }
            >
              <option value="USUARIO">
                Usuario
              </option>

              <option value="ADMINISTRADOR">
                Administrador
              </option>
            </select>
          </label>

          <label className="campo usuarios-campo-password">
            <span>
              Contraseña inicial
            </span>

            <input
              type="password"
              required
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              disabled={procesando}
              value={
                formulario.password
              }
              onChange={(evento) =>
                setFormulario(
                  (actual) => ({
                    ...actual,
                    password:
                      evento.target
                        .value,
                  }),
                )
              }
            />
          </label>

          <div className="usuarios-crear-accion">
            <button
              className="boton-primario"
              type="submit"
              disabled={procesando}
            >
              {procesando
                ? "Creando..."
                : "Crear usuario"}
            </button>
          </div>
        </form>
      </section>

      <section className="usuarios-panel-lista">
        <header className="usuarios-lista-cabecera">
          <div>
            <h2>
              Usuarios registrados
            </h2>

            <p>
              {usuarios.length}
              {" "}
              cuenta
              {usuarios.length === 1
                ? ""
                : "s"}
              {" "}
              registrada
              {usuarios.length === 1
                ? ""
                : "s"}
            </p>
          </div>
        </header>

        {cargando ? (
          <div className="usuarios-cargando">
            Cargando usuarios...
          </div>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla-usuarios">
              <thead>
                <tr>
                  <th>
                    Usuario
                  </th>

                  <th>
                    Rol
                  </th>

                  <th>
                    Estado
                  </th>

                  <th>
                    Último acceso
                  </th>

                  <th>
                    Actividad
                  </th>

                  <th>
                    Acciones
                  </th>
                </tr>
              </thead>

              <tbody>
                {usuarios.map(
                  (usuario) => {
                    const esCuentaActual =
                      usuario.id ===
                      usuarioActualId;

                    const bloqueado =
                      usuarioProcesandoId ===
                      usuario.id;

                    return (
                      <tr key={usuario.id}>
                        <td>
                          <strong>
                            {usuario.nombre}
                          </strong>

                          <small>
                            @{usuario.nombreUsuario}
                          </small>

                          <small>
                            {usuario.correo ??
                              "Sin correo"}
                          </small>

                          {esCuentaActual && (
                            <span className="usuario-actual">
                              Tu cuenta
                            </span>
                          )}
                        </td>

                        <td>
                          <select
                            className="usuarios-select-tabla"
                            value={usuario.rol}
                            disabled={
                              bloqueado ||
                              esCuentaActual
                            }
                            onChange={(evento) =>
                              void actualizarRol(
                                usuario,
                                evento.target
                                  .value as
                                  RolUsuario,
                              )
                            }
                          >
                            <option value="USUARIO">
                              Usuario
                            </option>

                            <option value="ADMINISTRADOR">
                              Administrador
                            </option>
                          </select>
                        </td>

                        <td>
                          <select
                            className={`usuarios-select-tabla estado-usuario-${usuario.estado.toLowerCase()}`}
                            value={
                              usuario.estado
                            }
                            disabled={
                              bloqueado ||
                              esCuentaActual
                            }
                            onChange={(evento) =>
                              void actualizarEstado(
                                usuario,
                                evento.target
                                  .value as
                                  EstadoUsuario,
                              )
                            }
                          >
                            <option value="ACTIVO">
                              Activo
                            </option>

                            <option value="BLOQUEADO">
                              Bloqueado
                            </option>

                            <option value="DESACTIVADO">
                              Desactivado
                            </option>
                          </select>

                          <small>
                            {etiquetaEstado(
                              usuario.estado,
                            )}
                          </small>
                        </td>

                        <td>
                          {formatearFecha(
                            usuario.ultimoAcceso,
                          )}
                        </td>

                        <td>
                          <small>
                            Sesiones:
                            {" "}
                            {
                              usuario._count
                                .sesiones
                            }
                          </small>

                          <small>
                            Auditorías:
                            {" "}
                            {
                              usuario._count
                                .auditorias
                            }
                          </small>
                        </td>

                        <td>
                          <button
                            className="boton-ver"
                            type="button"
                            disabled={bloqueado}
                            onClick={() => {
                              setUsuarioPasswordId(
                                usuario.id,
                              );

                              setNuevoPassword("");
                              setError(null);
                              setMensaje(null);
                            }}
                          >
                            Restablecer clave
                          </button>
                        </td>
                      </tr>
                    );
                  },
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {usuarioPassword && (
        <div className="modal-fondo">
          <section className="modal-password">
            <header>
              <div>
                <p className="pagina-etiqueta">
                  Seguridad
                </p>

                <h2>
                  Restablecer contraseña
                </h2>

                <p>
                  Usuario:
                  {" "}
                  <strong>
                    {
                      usuarioPassword
                        .nombreUsuario
                    }
                  </strong>
                </p>
              </div>

              <button
                className="modal-password-cerrar"
                type="button"
                onClick={() => {
                  setUsuarioPasswordId(
                    null,
                  );

                  setNuevoPassword("");
                }}
              >
                ×
              </button>
            </header>

            <form
              onSubmit={
                restablecerPassword
              }
            >
              <label className="campo">
                <span>
                  Nueva contraseña
                </span>

                <input
                  type="password"
                  required
                  minLength={12}
                  maxLength={200}
                  autoComplete="new-password"
                  value={nuevoPassword}
                  onChange={(evento) =>
                    setNuevoPassword(
                      evento.target.value,
                    )
                  }
                />
              </label>

              <p className="modal-password-aviso">
                Al cambiar la contraseña
                se cerrarán las sesiones
                activas de esta cuenta.
              </p>

              <div className="modal-password-acciones">
                <button
                  className="boton-ligero"
                  type="button"
                  onClick={() => {
                    setUsuarioPasswordId(
                      null,
                    );

                    setNuevoPassword("");
                  }}
                >
                  Cancelar
                </button>

                <button
                  className="boton-primario"
                  type="submit"
                  disabled={
                    usuarioProcesandoId ===
                    usuarioPassword.id
                  }
                >
                  Guardar contraseña
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}