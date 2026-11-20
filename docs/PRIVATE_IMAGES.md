# Eigene Hintergrundbilder

Die Karte zeigt standardmäßig eine neutrale Grafik mit Norden oben. Ein eigenes Bild bleibt auf deiner Home-Assistant-Instanz. Im Karteneditor lässt sich eine Bildquelle auswählen oder eintragen.

## Bildquelle einrichten

1. Das Bild zum Beispiel unter `/media/wetter/beispielbild.png` in Home Assistant ablegen.
2. Im Karteneditor den Medienbrowser öffnen und das Bild auswählen. Alternativ im Bildfeld `media-source://media_source/local/wetter/beispielbild.png` eintragen. Ob sich das Bild laden lässt, hängt von Quelle und Berechtigungen ab.
3. Bei Bedarf Bildrotation und Pfeilziel einstellen. Der Kompass bleibt nordorientiert. Das Bild wird quadratisch zugeschnitten und rund angezeigt. Die Zielkoordinaten beziehen sich auf den sichtbaren Ausschnitt.

Das entsprechende YAML-Feld heißt `site_image`. Es akzeptiert auch relative Bildpfade und Bild-URLs derselben Home-Assistant-Herkunft. Die Karte verwendet die Home-Assistant-Medienquelle direkt und bietet keine Upload-Funktion.

## Zugriff prüfen

**`/config/www` und `/local/` bieten keinen automatischen Zugriffsschutz.** Bei einem sensiblen Bild eine Home-Assistant-Medienquelle mit passenden Berechtigungen verwenden und den Zugriff auf die Bild-URL auch ohne Anmeldung testen. Private Bilder und Aufnahmen mit echten Daten gehören außerhalb des öffentlichen Repositorys.
