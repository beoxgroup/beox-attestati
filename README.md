# BeOx - Generatore attestati

Web app statica che crea un unico PDF A4 orizzontale con una pagina per partecipante. I formatori si selezionano da un elenco e le loro firme vengono inserite automaticamente sopra le linee del certificato.

## Uso locale

Servire la cartella `dist` con un server HTTP locale. L'app elabora nomi, data, logo e PDF interamente nel browser.

La versione monofile offline viene generata con `node build-offline.mjs` e può essere aperta direttamente nel browser.

