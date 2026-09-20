# SkillSpector in GitHub

Der Workflow prüft bei Pull Requests alle versionierten SKILL.md-Dateien samt
zugehörigem Verzeichnis. Er ist unabhängig davon, ob die Änderung von Claude,
Codex, Cursor oder einem Menschen stammt. Ohne Skills wird ausdrücklich
NO_SKILLS gemeldet. Manuell starten lässt sich der Workflow, sobald er im
Standardbranch verfügbar ist.

Scanner: NVIDIA/SkillSpector d162d9b343e559be13df8ebba093df3bc9d58c90 (2.11.2).
Actions sind auf Commit-SHAs fixiert; Python-Abhängigkeiten werden bei der
Installation aufgelöst und sind noch nicht separat durch einen Lockfile fixiert.

- Statische Prüfung mit --no-llm, kein LLM-Schlüssel erforderlich.
- Aktive Befunde und unvollständige Analyse führen zum Fehlerstatus.
- Keine mitgelieferten Befund-Unterdrückungen werden aktiviert.
- Keine Skill-Skripte werden ausgeführt; Berichte bleiben 14 Tage als Actions-Artefakt.
- Paket-/Versionsabfragen an OSV können stattfinden; dies ist kein Offline-Scan.
- Eine erfolgreiche Prüfung garantiert keine Schadlosigkeit und kontrolliert
  keine allgemeinen Datenzugriffe, Konnektoren oder außerhalb des Repos installierte Skills.

## Aktivierung

PR prüfen und zusammenführen. Für eine verbindliche Merge-Sperre muss der
Check SkillSpector / skills anschließend in einer Branch-Regel als erforderlich
ausgewählt werden (Anzeige des tatsächlichen Checknamens nach erstem Lauf prüfen).
Schutzregeln hängen von Repository, Plan und Administratorrechten ab.
Workflow und Prüfskript sollten durch Review geschützt werden: Schreibberechtigte
können sonst auch die Prüfregeln ändern. Dieser PR setzt keine Branch-Regeln.

## Verifikation dieser Änderung

Lokal mit dem fixierten Scanner geprüft: kein Skill → NO_SKILLS/Exit 0;
harmloser Skill → PASSED/Exit 0; Test-Skill mit Datendiebstahl-Anweisung →
FAILED/Exit 1; symbolischer Link als SKILL.md → FAILED/Exit 1.
Workflow-YAML geparst. Kein Anwendungscode geändert, keine neuen App-Testläufe.
Der GitHub-Actions-Lauf ist getrennt vom lokalen Test zu beurteilen.

Referenz: https://github.com/NVIDIA/SkillSpector
