# Instrukcje dla frontendu (Angular) — integracja z nowym backendem

## 1. Auth — sesja HTTP-only cookie

Backend używa `express-session` z `connect-pg-simple`. Sesja jest przechowywana w HTTP-only cookie — Angular nie musi nic robić z cookie, tylko wysyłać `withCredentials: true`.

### Endpointy

| Metoda | Endpoint | Body | Response | Uwagi |
|--------|----------|------|----------|-------|
| `POST` | `/api/auth/register` | `{ email, password }` | `{ user: { id, email } }` | Automatycznie zakłada sesję |
| `POST` | `/api/auth/login` | `{ email, password }` | `{ user: { id, email } }` | Automatycznie zakłada sesję |
| `POST` | `/api/auth/logout` | — | `{ ok: true }` | Niszczy sesję |
| `GET` | `/api/me` | — | `{ user: { id, email } }` | Wymaga auth, zwraca 401 jeśli nie zalogowany |

### Zmiany w Angular

1. **Wszystkie requesty** do backendu muszą mieć `withCredentials: true` (lub `{ credentials: 'include' }` dla fetch).
2. **AgentApiService** — URL z environment/proxy, nie hardcoded.
3. **Auth guard** — przed wejściem do chat sprawdź `GET /api/me`. Jeśli 401 → redirect do login.
4. **Interceptor** — dodaj globalnie `withCredentials` do `HttpClient`:

```typescript
// app.module.ts lub standalone config
provideHttpClient(withCredentials())
```

## 2. Chat — zmiany w ChatRequestBody

`domainState` jest teraz **opcjonalne** w `ChatRequestBody`. Jeśli nie jest wysłane, backend używa domyślnego stanu:

```typescript
interface ChatRequestBody {
  type: "message" | "resume";
  threadId: string;
  text: string;
  domainState?: DomainState;  // ← teraz optional
  lessonMode: boolean;
}
```

### Co zmienić w Angular

1. Wysyłaj `domainState` tylko jeśli go masz (np. przy resume). Przy pierwszym message możesz pominąć.
2. `threadId` jest teraz walidowany — jeśli podasz threadId innego usera, dostaniesz 403.
3. Jeśli podasz nowy threadId (nieistniejący), backend automatycznie utworzy wątek i przypisze do ciebie.

## 3. OpenRouter credentials — nowe endpointy

| Metoda | Endpoint | Body | Response | Uwagi |
|--------|----------|------|----------|-------|
| `PUT` | `/api/credentials/openrouter` | `{ apiKey: string }` | `{ ok: true }` | Zapisuje zaszyfrowany klucz |
| `GET` | `/api/credentials/openrouter/status` | — | `{ configured: boolean }` | Sprawdza czy klucz istnieje |
| `DELETE` | `/api/credentials/openrouter` | — | `{ ok: true }` | Usuwa klucz |

### UI do zrobienia

- **Settings page** — formularz do wprowadzenia klucza OpenRouter
- **Status indicator** — pokaż czy klucz jest skonfigurowany
- **Warning** — jeśli nie ma klucza, chat nie zadziała (backend zwróci error)

## 4. Progress — nowe endpointy

| Metoda | Endpoint | Body | Response | Uwagi |
|--------|----------|------|----------|-------|
| `GET` | `/api/progress` | — | `{ progress: LessonProgress[] }` | Lista wszystkich lekcji usera |
| `GET` | `/api/progress/:lessonId` | — | `{ progress: LessonProgress }` | Stan konkretnej lekcji |
| `PUT` | `/api/progress/:lessonId` | `{ status?, currentStep?, data? }` | `{ ok: true }` | Upsert — tworzy lub aktualizuje |
| `POST` | `/api/progress/exercises/result` | `{ lessonId, exerciseId, result }` | `{ ok: true }` | Zapis wyniku ćwiczenia |
| `GET` | `/api/progress/exercises/history` | `?limit=50` | `{ history: ExerciseResult[] }` | Historia wyników |

### Zasada

**Agent nie zapisuje do DB.** To Angular wysyła progress po otrzymaniu `DomainCommand` od agenta.

Przepływ:
1. Agent emituje `{ type: "domain-command", command: { type: "start-exercise", ... } }`
2. Angular wyświetla ćwiczenie
3. Po zakończeniu ćwiczenia Angular wysyła `POST /api/progress/exercises/result`
4. Po zmianie statusu lekcji Angular wysyła `PUT /api/progress/:lessonId`

## 5. AgentApiService — konfiguracja

```typescript
@Injectable({ providedIn: 'root' })
export class AgentApiService {
  private baseUrl = environment.apiUrl; // z environment, nie hardcoded

  constructor(private http: HttpClient) {}

  chat(body: ChatRequestBody): Observable<ChatResponseEvent> {
    // Użyj fetch z credentials: 'include' dla SSE/ndjson
    // lub HttpCLient z withCredentials
  }

  // Auth
  register(email: string, password: string) { ... }
  login(email: string, password: string) { ... }
  logout() { ... }
  getMe() { ... }

  // Credentials
  saveOpenRouterKey(apiKey: string) { ... }
  getOpenRouterStatus() { ... }
  deleteOpenRouterKey() { ... }

  // Progress
  getProgress() { ... }
  getLessonProgress(lessonId: string) { ... }
  updateLessonProgress(lessonId: string, data: any) { ... }
  saveExerciseResult(lessonId: string, exerciseId: string, result: any) { ... }
  getExerciseHistory(limit?: number) { ... }
}
```

## 6. Podsumowanie zmian po stronie Angular

| Obszar | Zmiana |
|--------|--------|
| **HttpClient** | Dodać `withCredentials()` globalnie |
| **AgentApiService** | URL z environment, dodać metody auth + credentials + progress |
| **Auth guard** | Sprawdzać `GET /api/me` przed chatem |
| **Login/Register page** | Nowe UI (lub przerobić istniejące na nowe endpointy) |
| **Settings page** | Nowe UI dla klucza OpenRouter |
| **Progress tracking** | Wysyłać `PUT /api/progress/:lessonId` po każdej zmianie |
| **Exercise results** | Wysyłać `POST /api/progress/exercises/result` po ćwiczeniu |
| **Chat** | `domainState` optional, wysyłać z `credentials: 'include'` |