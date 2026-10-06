# Plan wdrożenia — Guitar Neck VPS (Hetzner)

## 1. Cel dokumentu

Opisuje architekturę, konfigurację i procedury uruchomienia backendu Guitar Neck na pojedynczym VPS Hetzner z użyciem Docker Compose. Obejmuje wszystkie usługi: **Express API, agent AI (LangGraph), PostgreSQL, Caddy (reverse proxy + TLS) oraz n8n**.

---

## 2. Architektura docelowa

```
Internet:443
   │
   ▼
┌─────────────────────────────────────────┐
│  Hetzner VPS (CX21 / 2 vCPU, 2 GB RAM) │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │  Caddy (reverse proxy + TLS)       │ │
│  │  api.gitarneck.pl → backend:3001    │ │
│  │  n8n.gitarneck.pl  → n8n:5678      │ │
│  └────────────┬────────────────────────┘ │
│               │                          │
│  ┌────────────┴────────────────────────┐ │
│  │  Docker bridge network (guitarneck) │ │
│  │                                      │ │
│  │  ┌──────────┐  ┌─────────────────┐  │ │
│  │  │ backend  │  │ n8n             │  │ │
│  │  │ :3001    │  │ :5678           │  │ │
│  │  │ Express  │  │ automatyzacje   │  │ │
│  │  │ Agent AI │  └────────┬────────┘  │ │
│  │  └─────┬────┘           │           │ │
│  │        │                │           │ │
│  │  ┌─────┴────────────────┴────────┐  │ │
│  │  │  PostgreSQL :5432             │  │ │
│  │  │  - app data (Drizzle schema)  │  │ │
│  │  │  - LangGraph checkpoints      │  │ │
│  │  │  - session store              │  │ │
│  │  │  - n8n data                   │  │ │
│  │  └───────────────────────────────┘  │ │
│  │                                      │ │
│  │  Volumes:                            │ │
│  │  - pgdata (PostgreSQL)               │ │
│  │  - n8n_data (n8n files)             │ │
│  │  - caddy_data (certs)                │ │
│  │  - caddy_config (Caddy config)       │ │
│  └──────────────────────────────────────┘ │
└───────────────────────────────────────────┘
```

---

## 3. Wybór VPS — Hetzner CX21

| Parametr | Wartość |
|----------|---------|
| Model | CX21 (x86) |
| vCPU | 2 |
| RAM | 2 GB |
| Dysk | 20 GB NVMe |
| Transfer | 20 TB / miesiąc |
| Cena | ~€5.50/miesiąc (~24 PLN) |
| System | Ubuntu 24.04 LTS |

> **Uzasadnienie**: CX21 wystarcza, bo usługi rzadko działają równolegle. Szacowane zużycie RAM: system (~400 MB) + PostgreSQL (~200 MB) + backend Node (~150 MB) + n8n (~200 MB) + Caddy (~30 MB) = **~980 MB w spoczynku, ~1.75 GB przy szczycie**. 2 GB RAM daje ~250 MB bufora. Gdyby w przyszłości zabrakło, upgrade do CX22 przez panel Hetzner trwa 2 minuty.

---

## 4. Wstępna konfiguracja VPS

### 4.1 Konfiguracja SSH

```bash
# Po utworzeniu serwera w Hetzner Cloud Console
ssh root@<ip-serwera>

# Utwórz użytkownika (zamiast root)
adduser deploy
usermod -aG sudo deploy

# Skonfiguruj SSH: tylko klucz, bez hasła
mkdir -p ~deploy/.ssh
cp ~/.ssh/authorized_keys ~deploy/.ssh/
chown -R deploy:deploy ~deploy/.ssh
chmod 700 ~deploy/.ssh
chmod 600 ~deploy/.ssh/authorized_keys

# Wyłącz logowanie root przez SSH
sed -i 's/^PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd
```

### 4.2 Firewall (UFW)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh                # port 22
ufw allow http               # port 80  (dla Caddy ACME HTTP challenge)
ufw allow https              # port 443
ufw enable
```

### 4.3 fail2ban

```bash
apt install fail2ban -y
systemctl enable fail2ban
systemctl start fail2ban
```

### 4.4 Docker + Docker Compose

```bash
# Docker (z oficjalnego repo)
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh
usermod -aG docker deploy

# Docker Compose v2 (wbudowany w Docker)
docker compose version

# Automatyczne uruchamianie kontenerów po restarcie
systemctl enable docker

# Ograniczenie dostępu do socketu Docker
chmod 660 /var/run/docker.sock
```

### 4.5 Automatyczne aktualizacje

```bash
apt install unattended-upgrades -y
dpkg-reconfigure -plow unattended-upgrades
```

---

## 5. Struktura katalogów na VPS

```
/home/deploy/guitarneck/
├── docker-compose.yml       # Główny stack produkcyjny
├── .env                     # Sekrety (NIE w git)
├── Caddyfile                # Konfiguracja reverse proxy
├── backups/                 # Backup katalog
│   ├── pg/                  # pg_dump pliki
│   └── volumes/             # Kopie volume'ów
├── scripts/
│   ├── backup.sh            # Skrypt backupu
│   └── restore.sh           # Skrypt przywracania
└── git/                     # Kod źródłowy (opcjonalnie)
    └── guitar-neck-agent/
```

---

## 6. Docker Compose — pełny stack

### [`docker-compose.yml`](docker-compose.yml)

```yaml
services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - guitarneck

  backend:
    build:
      context: ./git/guitar-neck-agent
      dockerfile: Dockerfile
    restart: unless-stopped
    env_file: .env
    environment:
      PORT: 3001
      DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      NODE_ENV: production
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - guitarneck

  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    environment:
      N8N_PORT: 5678
      N8N_HOST: ${N8N_HOST}
      N8N_PROTOCOL: https
      WEBHOOK_URL: https://${N8N_HOST}/
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: postgres
      DB_POSTGRESDB_PORT: 5432
      DB_POSTGRESDB_DATABASE: ${N8N_DB_DATABASE}
      DB_POSTGRESDB_USER: ${POSTGRES_USER}
      DB_POSTGRESDB_PASSWORD: ${POSTGRES_PASSWORD}
      N8N_ENCRYPTION_KEY: ${N8N_ENCRYPTION_KEY}
      N8N_METRICS: false
      N8N_SKIP_WEBHOOK_DEREGISTRATION_SHUTDOWN: true
    volumes:
      - n8n_data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - guitarneck

  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
      - caddy_config:/config
    depends_on:
      - backend
      - n8n
    networks:
      - guitarneck

volumes:
  pgdata:
  n8n_data:
  caddy_data:
  caddy_config:

networks:
  guitarneck:
    driver: bridge
```

---

## 7. Rotacja logów Docker

Domyślnie Docker zapisuje logi kontenerów do plików na dysku i **nigdy ich nie kasuje**. Przy 4 usługach generujących logi (zwłaszcza n8n i backend z agentem AI) pliki mogą urosnąć do GB w ciągu kilku tygodni. Na 20 GB dysku CX21 to problem.

Zamiast dodawać `logging` do każdego serwisu w compose (co jest powtarzalne), lepiej skonfigurować rotację **globalnie** w pliku `/etc/docker/daemon.json`:

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  }
}
```

Po zmianie:
```bash
systemctl restart docker
```

**Co to daje?** Każdy kontener będzie przechowywał max 3 pliki logów po 10 MB = **40 MB na usługę**. Dla 4 usług = **160 MB**. Bez tego — potencjalnie kilka GB.

---

## 8. Caddyfile — routing i TLS

### [`Caddyfile`](Caddyfile) — wersja produkcyjna

```
# API backend
api.gitarneck.pl {
    reverse_proxy backend:3001
    header /api/* {
        Access-Control-Allow-Origin "https://gitarneck.pl"
        Access-Control-Allow-Credentials "true"
        Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        Access-Control-Allow-Headers "Content-Type, Cookie"
    }
}

# n8n
n8n.gitarneck.pl {
    reverse_proxy n8n:5678
}

# Przekierowanie z www na główną domenę (opcjonalnie)
www.gitarneck.pl {
    redir https://gitarneck.pl{uri} permanent
}

# Główna strona — Angular SPA na Cloudflare, tu tylko przekierowanie
gitarneck.pl {
    redir https://gitarneck.pl{uri} permanent
}
```

---

## 9. Plik .env (sekrety)

### [`.env`](.env) — NIGDY w git, tylko na serwerze

```bash
# --- PostgreSQL ---
POSTGRES_USER=guitarneck
POSTGRES_PASSWORD=<wygeneruj: openssl rand -base64 32>
POSTGRES_DB=guitarneck
N8N_DB_DATABASE=n8n

# --- Backend ---
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://gitarneck.pl
SESSION_SECRET=<wygeneruj: openssl rand -hex 32>
USER_CREDENTIALS_ENCRYPTION_KEY=<wygeneruj: openssl rand -hex 32>
DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}

# --- LangGraph / AI ---
OPENROUTER_API_KEY=<twój-klucz-openrouter>
OPENROUTER_MODEL=deepseek/deepseek-v4-flash

# --- n8n ---
N8N_HOST=n8n.gitarneck.pl
N8N_ENCRYPTION_KEY=<wygeneruj: openssl rand -hex 32>
```

**Generowanie sekretów:**

```bash
openssl rand -base64 32   # → POSTGRES_PASSWORD
openssl rand -hex 32      # → SESSION_SECRET, USER_CREDENTIALS_ENCRYPTION_KEY, N8N_ENCRYPTION_KEY
```

---

## 10. Migracja bazy danych

Backend używa Drizzle ORM z migracjami SQL. Przy starcie kontenera migracje muszą zostać wykonane.

### Opcja A: init container (zalecane)

Dodaj do `docker-compose.yml` osobny serwis `migrate`:

```yaml
migrate:
  build:
    context: ./git/guitar-neck-agent
    dockerfile: Dockerfile
  env_file: .env
  environment:
    DATABASE_URL: postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
  depends_on:
    postgres:
      condition: service_healthy
  command: sh -c "node -e \"const { migrate } = require('drizzle-orm/postgres-js/migrator'); const { drizzle } = require('drizzle-orm/postgres-js'); const postgres = require('postgres'); const sql = postgres(process.env.DATABASE_URL); migrate(drizzle(sql), { migrationsFolder: 'drizzle' }).then(() => { console.log('Migration complete'); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });\""
  networks:
    - guitarneck
  profiles:
    - migrate
```

Uruchom raz:
```bash
docker compose --profile migrate run --rm migrate
```

Następnie uruchom główny stack:
```bash
docker compose up -d
```

### Opcja B: wpisz migrację w entrypoint backendu

Zmodyfikuj [`package.json`](package.json) → `start` na:
```bash
npx drizzle-kit migrate && node dist/index.js
```

---

## 11. Backupy

### 10.1 Automatyczny skrypt backupu

[`scripts/backup.sh`](scripts/backup.sh):
```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR=/home/deploy/guitarneck/backups
DATE=$(date +%Y-%m-%d_%H-%M)
RETENTION_DAYS=30

mkdir -p "$BACKUP_DIR/pg" "$BACKUP_DIR/volumes"

# pg_dump wszystkich baz
docker compose exec -T postgres pg_dumpall -U guitarneck > "$BACKUP_DIR/pg/full_$DATE.sql"

# Kompresja
gzip "$BACKUP_DIR/pg/full_$DATE.sql"

# Usuń stare kopie
find "$BACKUP_DIR/pg" -name "*.sql.gz" -mtime +$RETENTION_DAYS -delete
```

### 10.2 Cron (codzienny backup o 3:00)

```bash
crontab -e
```

```
0 3 * * * /home/deploy/guitarneck/scripts/backup.sh
```

### 10.3 Offsite backup (opcjonalnie)

Można wysyłać kopie na S3-compatible storage (Hetzner Object Storage ~€5/TB):

```bash
# Instalacja aws-cli dla S3-compatible
apt install awscli -y

# Dodaj do backup.sh na końcu:
aws s3 cp "$BACKUP_DIR/pg/full_$DATE.sql.gz" s3://gitarneck-backups/pg/
```

---

## 12. Procedura pierwszego wdrożenia

```bash
# 1. Połącz się przez SSH
ssh deploy@<ip-serwera>

# 2. Sklonuj repo
mkdir -p /home/deploy/guitarneck/git
cd /home/deploy/guitarneck/git
git clone <repo-url> guitar-neck-agent

# 3. Utwórz pliki konfiguracyjne
cd /home/deploy/guitarneck
# Skopiuj docker-compose.yml, Caddyfile, .env z powyższych szablonów
nano .env   # wpisz prawdziwe sekrety

# 4. Zbuduj i uruchom
docker compose up -d

# 5. Wykonaj migrację bazy
docker compose --profile migrate run --rm migrate

# 6. Sprawdź logi
docker compose logs -f

# 7. Sprawdź endpoint zdrowia
curl https://api.gitarneck.pl/api/health
# → {"status":"ok","db":"connected"}
```

---

## 13. Procedura aktualizacji backendu

```bash
cd /home/deploy/guitarneck/git/guitar-neck-agent
git pull origin main
docker compose build backend
docker compose up -d --no-deps backend
docker compose logs -f backend
```

---

## 14. Procedura rollbacku

```bash
# Jeśli nowa wersja nie działa:
cd /home/deploy/guitarneck/git/guitar-neck-agent
git revert HEAD  # lub git checkout <poprzedni-commit>
docker compose build backend
docker compose up -d --no-deps backend
```

---

## 15. Monitoring i alerty

### 14.1 Podstawowa kontrola (bez zewnętrznych narzędzi)

```bash
# Cron co 5 minut sprawdza health
*/5 * * * * curl -f https://api.gitarneck.pl/api/health || echo "Backend down" | mail -s "ALERT" admin@example.com
```

### 14.2 Docker healthcheck

Domyślnie każde kontener ma restart `unless-stopped`. W razie awarii Docker restartuje usługę automatycznie.

### 14.3 Logi

```bash
# Podgląd logów wszystkich usług
docker compose logs -f --tail=100

# Podgląd logów backendu
docker compose logs -f backend

# Rotacja logów (skonfigurowana w docker-compose.yml — max 10 MB na plik)
```

### 14.4 Zewnętrzne monitorowanie (opcjonalnie)

- **Uptime Kuma** (można uruchomić jako dodatkowy serwis w Docker)
- **Better Stack / HetrixTools** (darmowe plany dla podstawowych monitorów)

---

## 16. Podsumowanie kosztów miesięcznych

| Składnik | Koszt (€) | Koszt (PLN) |
|----------|-----------|-------------|
| Hetzner CX21 | ~5.50 | ~24 |
| Domena (.pl) | ~1.5 | ~7 |
| OpenRouter API | usage-based | ~$0-5 |
| Hetzner Object Storage (opcjonalnie) | ~1 | ~4 |
| **Razem (bez API)** | **~7 €** | **~31 PLN** |
| **Razem (z Object Storage)** | **~8 €** | **~35 PLN** |

---

## 17. Mapa drogowa — zadania do wykonania

| # | Zadanie | Priorytet |
|---|---------|-----------|
| 1 | Utworzenie VPS CX21 w Hetzner | Wysoki |
| 2 | Konfiguracja SSH + firewall + fail2ban | Wysoki |
| 3 | Instalacja Docker + Docker Compose | Wysoki |
| 4 | Stworzenie struktury katalogów na VPS | Wysoki |
| 5 | Przygotowanie produkcyjnego docker-compose.yml (z n8n) | Wysoki |
| 6 | Przygotowanie produkcyjnego Caddyfile (z routowaniem na API + n8n) | Wysoki |
| 7 | Konfiguracja .env z sekretami | Wysoki |
| 8 | Konfiguracja DNS (api.gitarneck.pl, n8n.gitarneck.pl → IP VPS) | Wysoki |
| 9 | Wdrożenie stacka po raz pierwszy | Wysoki |
| 10 | Migracja bazy danych (Drizzle) | Wysoki |
| 11 | Skonfigurowanie automatycznych backupów | Średni |
| 12 | Skonfigurowanie rotacji logów Docker | Średni |
| 13 | Testowe odtworzenie z backupu | Średni |
| 14 | Dodanie monitorowania (healthcheck cron) | Niski |
| 15 | Konfiguracja aktualizacji apt (unattended-upgrades) | Niski |
| 16 | Przetestowanie procedury rollbacku | Niski |

---

## 18. Znane ryzyka i mitigacje

> **Status projektu**: live preview. Poniższe ryzyka są podzielone na **🔴 KRYTYCZNE** (wdrożyć przed uruchomieniem) i **🟡 NICE-TO-HAVE** (można odłożyć, ale niskim kosztem warto zrobić od razu).

---

### 🔴 KRYTYCZNE — wdrożyć przed uruchomieniem

#### d) Wykradzenie sekretów z .env

**Na czym polega:** Ktoś uzyska dostęp do serwera przez SSH (np. skradziony klucz, podatność) i odczyta `.env` z hasłami do bazy, kluczami API, encryption key do credentials użytkowników. To najpoważniejsze ryzyko — daje dostęp do wszystkiego.

**Co robić (obowiązkowo):**
- `.env` NIGDY w repozytorium git (`.gitignore` już to blokuje)
- Backup `.env` trzymaj w zaszyfrowanym menedżerze haseł (Bitwarden, 1Password)
- Opcjonalnie: zaszyfruj `.env` na serwerze GPG:
  ```bash
  gpg --symmetric --cipher-algo AES256 .env   # tworzy .env.gpg
  rm .env
  # Przy starcie: gpg --decrypt .env.gpg > .env
  ```
  Klucz GPG trzymaj osobno (YubiKey lub Bitwarden)

#### e) Atak na n8n (niezabezpieczony endpoint)

**Na czym polega:** Jeśli `n8n.gitarneck.pl` jest publicznie dostępny bez uwierzytelnienia, każdy może tworzyć własne workflow, wykonywać webhooki, a nawet uzyskać dostęp do bazy przez n8n.

**Co robić (obowiązkowo):** n8n ma wbudowane logowanie (email + hasło przy pierwszym uruchomieniu). Wystarczy upewnić się, że jest włączone:
```yaml
# docker-compose.yml → environment dla n8n:
N8N_AUTH_ACTIVE: true
N8N_AUTH_COOKIE_SECURE: true
```
Przy pierwszym uruchomieniu n8n poprosi o utworzenie konta administratora. To wystarczy — nie potrzeba dodatkowego `basicauth` w Caddyfile.

---

### 🟡 NICE-TO-HAVE — niskim kosztem warto, ale nie blokuje uruchomienia

#### a) Niewystarczająca pamięć RAM (2 GB)

**Na czym polega:** Jeśli wszystkie usługi uruchomią się jednocześnie (np. po restarcie serwera), a do tego n8n wykonuje ciężki workflow i backend odpowiada na request agenta AI — system może zacząć swapować na dysk. W efekcie wszystko zwalnia, a w skrajnym przypadku OOM Killer ubija proces.

**Co robić:**
- `restart: unless-stopped` (już jest w compose) — kontenery wrócą po zabiciu
- Monitoruj `docker stats` raz na jakiś czas
- Jeśli faktycznie braknie — upgrade do CX22 przez panel Hetzner (2 minuty, bez przeładowania OS)

#### b) Dysk 20 GB pełny od logów

**Na czym polega:** Docker domyślnie nie rotuje logów. Przy 4 usługach logi mogą zająć GB w ciągu kilku tygodni. Gdy dysk jest pełny, PostgreSQL przestaje przyjmować zapisy, a API zwraca 500.

**Co robić:** Rotacja logów (sekcja 7) — konfiguruje się raz, potem działa. Warto zrobić od razu, bo koszt: 5 minut.

#### c) Awarie Hetzner

**Na czym polega:** Awaria fizycznego serwera lub problem z siecią w centrum danych. Zdarza się bardzo rzadko (Hetzner ma ~99.95% uptime).

**Co robić:** Na etapie preview — wystarczy backup bazy (sekcja 11). W razie awarii: nowy VPS + backup + zmiana DNS (~30 minut).

#### f) Przypadkowe `docker compose down --volumes`

**Na czym polega:** Ktoś (lub Ty) przez pomyłkę wykona `docker compose down -v` zamiast `docker compose down`. Flaga `-v` usuwa volume'y, czyli **całą bazę danych**.

**Co robić:**
- Zawsze używaj `docker compose down` bez `-v` do rutynowych restartów
- Backup bazy (codzienny pg_dump) — wtedy nawet po pomyłce odtwarzasz dane z ostatniego dumpa
- Alias w bashu dla bezpieczeństwa:
  ```bash
  alias dcd='docker compose down'
  alias dcdv='echo "NIE! Uzyj dcd bez -v. Do usuwania volume'ow: docker compose down --volumes"'
  ```

---

## 19. Referencje

- [docker-compose.yml](docker-compose.yml) — obecny plik deweloperski (do rozszerzenia)
- [Caddyfile](Caddyfile) — obecna konfiguracja dev (do zastąpienia produkcyjną)
- [Dockerfile](Dockerfile) — multi-stage build (poprawny)
- [README.md](README.md) — dokumentacja projektu
- [src/index.ts](src/index.ts) — entry point backendu
- [src/db/client.ts](src/db/client.ts) — konfiguracja połączenia z PostgreSQL
- [package.json](package.json) — zależności i skrypty