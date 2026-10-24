-- OptiPedidos · Migración 0025 · Cotizaciones de lunas: modo solo lectura y auditoría
-- Sin cambios destructivos: solo triggers, iguales a los del resto de tablas de la óptica.
--   * t_00_suscripcion: con la suscripción suspendida no se crean ni modifican reglas ni cotizaciones.
--   * t_auditar: cada alta, cambio o baja queda en la auditoría (quién, cuándo, antes y después).

do $$
declare t text;
begin
  foreach t in array array['lunas_reglas_cotizacion', 'lunas_reglas_cotizacion_costos', 'cotizaciones_lunas',
                           'cotizaciones_lunas_versiones', 'cotizaciones_lunas_lineas', 'cotizaciones_lunas_costos',
                           'cotizaciones_lunas_eventos'] loop
    execute format('create trigger t_00_suscripcion before insert or update on public.%I for each row execute function public.f_exigir_suscripcion()', t);
    execute format('create trigger t_auditar after insert or update or delete on public.%I for each row execute function public.f_auditar()', t);
  end loop;
end $$;
