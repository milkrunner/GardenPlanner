# Release-Prozess

Ein Release entsteht nur durch einen bewusst gepushten Versions-Tag `vX.Y.Z` (oder
`vX.Y.Z-beta.1` für eine Vorabversion). Normale Pushes, Pull Requests und Branches
veröffentlichen nichts. Der Workflow `.github/workflows/release.yml` hat keinen anderen
Auslöser.

## Ablauf

1. Entscheiden, welche Version erscheint ([Semantic Versioning](https://semver.org/lang/de/):
   Patch für Fehlerbehebungen, Minor für abwärtskompatible Funktionen, Major für
   inkompatible API-Änderungen). Die Versionsnummer wird nicht automatisch vergeben.
2. In einem Pull Request die `version` in `package.json` anheben und mit
   `npm install --package-lock-only` das `package-lock.json` nachziehen.
3. Im selben Pull Request in `CHANGELOG.md` den Abschnitt `[Unreleased]` in
   `[X.Y.Z] - JJJJ-MM-TT` umbenennen, einen neuen leeren `[Unreleased]`-Abschnitt anlegen
   und den Link am Dateiende ergänzen.
4. Pull Request nach grüner CI mergen. Der getaggte Commit muss auf `main` liegen.
5. Den Tag auf dem gemergten `main`-Stand setzen und pushen (der einzige Schritt, der
   veröffentlicht):

   ```sh
   git switch main && git pull
   git tag -a vX.Y.Z -m "Release X.Y.Z"
   git push origin vX.Y.Z
   ```

6. Den Lauf unter „Actions → Release“ beobachten. Danach unter „Releases“ und auf
   Docker Hub prüfen, ob die Version und die Tags erscheinen.

Vorabversionen (`vX.Y.Z-beta.1`) folgen demselben Ablauf mit `version` `X.Y.Z-beta.1` in
`package.json`.

## Was der Workflow tut

1. **Tag prüfen:** Der Tag muss eine gültige Version sein, zur `version` in `package.json`
   passen und auf einem Commit von `main` liegen. Sonst bricht der Lauf ab, bevor etwas
   veröffentlicht wird.
2. **Tests:** `npm run check` und der Chromium-Smoke wie in `test.yml`.
3. **Image bauen und scannen:** Das Image wird für `linux/amd64` gebaut und mit Trivy
   (Schweregrad `CRITICAL`) geprüft, noch ohne Docker-Hub-Anmeldung.
4. **Veröffentlichen:** Anmeldung mit den Repository-Secrets `DOCKERHUB_USERNAME` und
   `DOCKERHUB_TOKEN` (dieselben wie beim Workflow „Docker Hub description“), dann Push von
   `milkrunner/gardenplanner` für `linux/amd64` und `linux/arm64`.
5. **GitHub-Release:** `gh release create` mit automatisch erzeugten Notizen. Die
   Kategorien (Sicherheit, Fehlerbehebungen, Abhängigkeiten …) stammen aus den Labels der
   gemergten Pull Requests und stehen in `.github/release.yml`. Pull Requests ohne
   passendes Label erscheinen unter „Weitere Änderungen“.

Die Secrets werden nur im Schritt der Docker-Hub-Anmeldung gelesen. Der Workflow läuft nie
für Pull Requests, daher erhalten Forks sie nicht.

### Docker-Tags

| Version         | Tags                                           |
| --------------- | ---------------------------------------------- |
| `v1.4.2`        | `1.4.2`, `1.4` und `latest`                    |
| `v1.4.3-beta.1` | nur `1.4.3-beta.1` (kein `latest`, kein `1.4`) |

`latest` und `X.Y` erhalten nur die höchste stabile Version. Ein nachträglicher
Patch-Release einer älteren Linie (etwa `v1.3.9`, wenn `v1.4.0` existiert) setzt `latest`
deshalb nicht zurück. Die bestehenden `beta`-Tags auf Docker Hub bleiben unverändert und
werden von diesem Workflow nicht berührt.

### Mehrarchitektur

Das Image wird für `linux/amd64` und `linux/arm64` gebaut (QEMU-Emulation im selben Job).
Das ist hier vertretbar: Die Laufzeitabhängigkeiten sind reines JavaScript ohne native
Module, das Basis-Image `node:22-alpine` ist für beide Architekturen verfügbar. Der
arm64-Teil läuft emuliert und macht den Bau langsamer (einige Minuten). Gescannt wird nur
die amd64-Variante.

## Vor dem ersten Release (einmalig)

- Die Repository-Secrets `DOCKERHUB_USERNAME` und `DOCKERHUB_TOKEN` prüfen (der Token
  braucht Schreibrechte auf `milkrunner/gardenplanner`). Nichts davon gehört in Dateien.
- Eine Version wählen. `package.json` steht auf `1.0.0`, auf Docker Hub liegen aber
  Beta-Tags bis `3.11.11-beta`. Die erste Version bewusst festlegen (und dabei
  entscheiden, ob die Nummerierung an die Beta-Tags anschließt).
- Nach dem ersten stabilen Release `docs/DOCKERHUB.md` (Abschnitt „Verfügbare Tags“,
  Schnellstart, Mehrarchitektur) anpassen und den Workflow „Docker Hub description“
  mit `dry_run` deaktiviert ausführen.

## Ein fehlgeschlagenes oder falsches Release zurücknehmen

- **Lauf schlug vor dem Push fehl** (Tag-Prüfung, Tests, Scan): Es wurde nichts
  veröffentlicht. Ursache beheben. Der Tag zeigt noch auf den alten Commit, also zuerst
  löschen und nach der Korrektur neu setzen:

  ```sh
  git push origin --delete vX.Y.Z
  git tag -d vX.Y.Z
  ```

- **Docker-Push erfolgreich, GitHub-Release fehlt:** Den Job „GitHub-Release erstellen“
  im Actions-Lauf erneut starten; er legt das Release an, falls es noch nicht existiert.
- **Release war fehlerhaft:** Veröffentlichte Versionen nicht überschreiben. Das GitHub-Release
  in der Weboberfläche oder mit `gh release delete vX.Y.Z` entfernen (oder als Vorabversion
  markieren), den Tag löschen und die Docker-Tags `X.Y.Z` (sowie bei Bedarf `X.Y`)
  in der Docker-Hub-Oberfläche löschen. Wenn `latest` auf die fehlerhafte Version zeigt,
  die vorige stabile Version erneut veröffentlichen (Tag setzen, Workflow neu starten) oder
  `latest` per `docker buildx imagetools create -t milkrunner/gardenplanner:latest
milkrunner/gardenplanner:<vorherige-Version>` zurücksetzen. Danach mit einer höheren
  Patch-Version korrigiert neu veröffentlichen; eine gelöschte Versionsnummer nicht
  wiederverwenden.

Sicherheitsrelevante Funde in einer veröffentlichten Version gehören zusätzlich in den
Changelog (Abschnitt „Sicherheit“) und, falls nötig, in eine Sicherheitsmeldung nach
`docs/SECURITY.md`.

## Dependabot

`.github/dependabot.yml` öffnet wöchentlich Pull Requests für npm, das Dockerfile und
GitHub Actions. Entwicklungs- und Produktionsabhängigkeiten werden als Minor-/Patch-Gruppe
zusammengefasst, Major-Updates einzeln. Es gibt kein Auto-Merge; jeder Pull Request läuft
durch die CI und wird von Hand geprüft. Node-Major-Updates des Basis-Images sind
ausgenommen und werden zusammen mit `.nvmrc`, `engines` und CI vorgenommen. Die
`overrides` in `package.json` verwaltet Dependabot nicht, siehe
[docs/DEPENDENCIES.md](DEPENDENCIES.md).
