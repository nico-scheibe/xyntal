// GitHub Pages zeigt diese Seite unter jeder falschen Adresse. Basis selbst bestimmen,
// damit Schriften, Styles und Links unter /xyntal/ wie auf einer eigenen Domain funktionieren.
document.write('<base href="' + (location.pathname.startsWith("/xyntal/") || location.pathname === "/xyntal" ? "/xyntal/" : "/") + '">');
