# Frontend (Angular) — obsługa `showIntervals`

## Co się zmieniło

Backend wysyła teraz opcjonalne pole `showIntervals` w `start-exercise` commandzie.

**Przykład commanda z backendu:**
```json
{
  "type": "start-exercise",
  "question": "Znajdź wszystkie 5 (kwintę czystą) względem D",
  "rootNote": "D",
  "expectedIntervals": ["5"],
  "showIntervals": ["1"],
  "fretRange": { "min": 0, "max": 12 }
}
```

`showIntervals: ["1"]` oznacza: "pokaż interwał 1 (prymę) od D na gryfie jako punkt odniesienia".

## Co trzeba zrobić

### 1. W handlerze `start-exercise` commanda

W miejscu gdzie Angular odbiera `{ type: "domain-command", command: { type: "start-exercise", ... } }`:

```typescript
// Przykładowy handler w Angular (dostosuj do swojej struktury)
case 'start-exercise':
  this.exerciseMode = true;
  this.exerciseTask = {
    question: command.question,
    rootNote: command.rootNote,
    expectedIntervals: command.expectedIntervals,
  };

  // NOWE: pokaż reference intervals na gryfie
  if (command.showIntervals && command.showIntervals.length > 0) {
    this.showReferenceIntervals(command.rootNote, command.showIntervals);
  }
  break;
```

### 2. Implementacja `showReferenceIntervals`

Metoda oblicza pozycje interwałów na gryfie i wyświetla je:

```typescript
// Przykładowa implementacja — dostosuj do swojego modelu danych
showReferenceIntervals(rootNote: string, intervals: string[]): void {
  // 1. Dla każdego interwału oblicz pozycje na wszystkich strunach
  //    (użyj istniejącej logiki z show-intervals)
  const referencePositions = this.calculateIntervalPositions(rootNote, intervals);

  // 2. Wyświetl je na gryfie jako "reference" markery
  //    - Użyj tego samego mechanizmu co show-intervals
  //    - Ale oznacz je jako nieklikalne (reference, nie selekcja ucznia)
  this.fretboardDisplay.showIntervals(referencePositions, {
    interactive: false,        // uczeń nie może ich kliknąć
    visualStyle: 'reference',  // inny styl wizualny
  });
}
```

### 4. Przy sprawdzaniu odpowiedzi

Reference notes **NIE** są brane pod uwagę przy walidacji:
- Nie są wliczane do `selectedNotes` przy submicie
- Nie są sprawdzane jako odpowiedź ucznia
- Są tylko wizualnym punktem odniesienia

### 5. Przy czyszczeniu / końcu ćwiczenia

Reference notes znikają razem z exercise mode:
- `clear_view` — czyści wszystko łącznie z reference notes
- Koniec ćwiczenia (po sprawdzeniu) — reference notes znikają
- Nowe `start-exercise` — zastępuje poprzednie reference notes

## Przykłady

| `showIntervals`   | Efekt na gryfie                           |
| ----------------- | ----------------------------------------- |
| `["1"]`           | Pokazuje nutę podstawową (D)              |
| `["1", "5"]`      | Pokazuje D i A (kwinta od D)              |
| `["1", "3", "5"]` | Pokazuje cały akord D-dur                 |
| `[]` lub brak     | Nie pokazuje nic (zachowanie jak obecnie) |

## Test cases do sprawdzenia

1. **Podstawowy:** `showIntervals: ["1"]` od D — widzisz D na gryfie, możesz klikać inne nuty
2. **Wiele interwałów:** `showIntervals: ["1", "5"]` — widzisz D i A, klikasz tercję
3. **Brak showIntervals:** stare ćwiczenia działają bez zmian
4. **Reference nie są klikalne:** kliknięcie na reference note nic nie robi
5. **Czyszczenie:** `clear_view` usuwa reference notes
6. **Nowe ćwiczenie:** reference notes z poprzedniego ćwiczenia znikają