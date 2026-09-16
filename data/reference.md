# The reference file

`reference.json` is what the page draws its pitch bands, its vowel diamonds and its target list from. **Load reference**, under Settings, replaces it with a file of your own. The file is read in the browser and saved in that browser's storage, so it is still loaded next time. It is never uploaded or sent anywhere, and **Back to the shipped reference** forgets it.

Load your own when your clinician works to different bands, when you want target vowels from a language that is not here, or when you want your own practice sentences on screen.

## Shape

```json
{
  "name": "What to call this set",
  "pitch_bands": [
    { "name": "Typical male", "low": 90, "high": 155, "color": "rgba(106, 159, 181, 0.14)" },
    { "name": "Typical female", "low": 165, "high": 255, "color": "rgba(184, 84, 80, 0.13)" }
  ],
  "vowel_reference": [
    { "lang": "pt", "vowel": "i", "word": "i", "m_f1": 285, "m_f2": 2198, "w_f1": 307, "w_f2": 2676 }
  ],
  "languages": { "pt": "What to call this language in the picker" },
  "sentences": ["Something to read while you watch the trace."],
  "sources": { "pt": "Where these numbers came from." }
}
```

A file needs at least one of `pitch_bands` and `vowel_reference`, and everything else is optional. A file with only `pitch_bands` keeps the shipped vowels; one with only `vowel_reference` keeps the shipped bands. **Bands you have edited in Settings win over a file's**, so loading a reference never quietly undoes them: put the bands back to the shipped ones first if you want the file's.

| Key | What it does |
|---|---|
| `pitch_bands` | The shaded bands on the trace, and the five zones the share bar counts. **Two bands, read as islands, give five zones**: below the lower, the lower, the gap between them, the upper, above the upper. More or fewer than two still draws, and the share bar follows whatever it is given. |
| `vowel_reference` | The diamonds on the plane and the entries in the Target picker. `m_` and `w_` are the two reference sets, both always drawn. Hz. |
| `languages` | What the Reference picker calls each `lang`, and where the citation line comes from. A `lang` with no entry here shows its own code. |
| `sentences` | Lines to read while watching. Shown one at a time under the trace, and the page ships with none. |
| `sources` | Free text per `lang`, and under `pitch_bands`, printed beside the picker. |

## What the page checks

A file that is not JSON, or whose `vowel_reference` rows are missing `m_f1`, `m_f2`, `w_f1` or `w_f2`, is rejected with a message saying which row. A row whose numbers do not parse is dropped and counted, rather than drawn at zero. **Nothing silently falls back**: if what you loaded cannot be drawn, the page says so and keeps what it had.

## What ships

Pitch bands of 80-140 and 175-275 Hz, the typical ranges voice-training apps draw, which are a practical reference rather than a published norm. Vowels from Hillenbrand et al. (1995) for American English, averaged over that study's published measurements, and from Escudero et al. (2009) Table I for Brazilian Portuguese. Every citation is in `reference.json` under `sources`, and the per-study caveats are in the README.
