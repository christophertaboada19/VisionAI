# Configuración central del Backend VISION AI.
# Lee variables de entorno desde backend/.env y, como respaldo automático, desde frontend/.env.
import os
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent.parent
FRONTEND_ENV = BASE_DIR.parent / "frontend" / ".env"
BACKEND_ENV = BASE_DIR / ".env"

if FRONTEND_ENV.exists():
    load_dotenv(FRONTEND_ENV, override=False)
if BACKEND_ENV.exists():
    load_dotenv(BACKEND_ENV, override=True)


class Settings:
    @property
    def PORT(self) -> int:
        return int(os.getenv("PORT", "8000"))

    @property
    def SUPABASE_URL(self) -> str:
        return os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL", "")

    @property
    def SUPABASE_KEY(self) -> str:
        return os.getenv("SUPABASE_KEY") or os.getenv("VITE_SUPABASE_ANON_KEY", "")

    @property
    def TELEGRAM_BOT_TOKEN(self) -> str:
        if BACKEND_ENV.exists():
            load_dotenv(BACKEND_ENV, override=True)
        return os.getenv("TELEGRAM_BOT_TOKEN", "")

    @property
    def TELEGRAM_CHAT_ID(self) -> str:
        if BACKEND_ENV.exists():
            load_dotenv(BACKEND_ENV, override=True)
        return os.getenv("TELEGRAM_CHAT_ID", "")

    @property
    def NTFY_TOPIC(self) -> str:
        if BACKEND_ENV.exists():
            load_dotenv(BACKEND_ENV, override=True)
        return os.getenv("NTFY_TOPIC", "")  # sin valor por defecto: el tema de ntfy es privado


settings = Settings()
