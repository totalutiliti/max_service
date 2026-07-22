DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'max_service_app') THEN
    CREATE ROLE max_service_app LOGIN PASSWORD 'max_service_runtime_local';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE max_service TO max_service_app;
GRANT USAGE ON SCHEMA public TO max_service_app;
