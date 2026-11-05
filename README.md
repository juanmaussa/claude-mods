# claude-mods

Mods personales para Claude Code, hechos con hooks. Este repositorio es un marketplace de plugins.

## usage-bars

Muestra el uso de tu plan de Claude como dos barras finas encima del prompt:

```
▎5h ███░░░░░ 42% ↻1h20m   7d █░░░░░░░ 18% ↻ Dom 7pm
```

- **5h** y **7d**: porcentaje usado de la ventana de 5 horas y de la semanal.
- **↻**: cuándo se reinicia. En 5h es una cuenta regresiva; en 7d, el día y la hora local (por ejemplo `Dom 7pm`).
- **Color**: verde mientras el uso es bajo, amarillo desde el 75 % y rojo desde el 90 %.
- **Aviso**: una notificación, una vez por periodo, al pasar del 90 %.
- La cuenta regresiva se redibuja cada 2 minutos. Las cifras las entrega Claude Code; el mod no hace peticiones de red, no ejecuta comandos y no lee ni escribe archivos.
- Solo aparece con un plan de suscripción, después de la primera respuesta con cifras de uso.

### Instalación

Desde una terminal (en macOS, Linux o Windows):

```bash
claude plugin marketplace add juanmaussa/claude-mods
claude plugin install usage-bars@claude-mods
```

En la app de escritorio, donde `/plugin` no funciona: botón `+` junto al prompt, luego Plugins, Add marketplace con `juanmaussa/claude-mods`, y después Add plugin.

Reinicia la sesión si la barra no aparece de inmediato. Para ajustar el gris del tramo vacío, el ancho o el intervalo, edita las constantes al inicio de `usage-bars/hooks/register.tsx`.

## Licencia

MIT.
