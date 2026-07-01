const fs = require('fs');
const path = 'c:/Users/marie/Downloads/telnet/frontend/src/app/components/dashboard.html';
let html = fs.readFileSync(path, 'utf8');

const fields = [
  {id: 'appreciation', context: 'event'},
  {id: 'evaluation', context: 'event'},
  {id: 'traitementAction', context: 'incident'},
  {id: 'preconisation', context: 'incident'},
  {id: 'commentaireEfficacite', context: 'incident'},
  {id: 'impactContinuiteDescription', context: 'incident'},
  {id: 'changementDeclencheDescription', context: 'incident'},
  {id: 'causesPossibles', context: 'event'}
];

fields.forEach(f => {
  // Replace <label for="fieldId">Text</label>
  const regex = new RegExp(`<label for="${f.id}"(?:[^>]*)>([\\s\\S]*?)</label>`, 'g');
  html = html.replace(regex, (match, labelText) => {
    // If it already has btn-icon, skip
    if (match.includes('btn-icon')) return match;
    
    // Clean label text
    labelText = labelText.trim();
    if (labelText.startsWith('<span>')) {
      // already wrapped
    } else {
      labelText = `<span>${labelText}</span>`;
    }

    return `<label for="${f.id}" style="display:flex; justify-content:space-between; align-items:center;">
  ${labelText}
  <div style="display:flex; gap:0.5rem;">
    <button type="button" class="btn-icon" (click)="magicFill()" title="Générer avec l'IA ✨">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M2 12l5.25-1.5L8.75 5.25 10.25 10.5 15.5 12l-5.25 1.5L8.75 18.75 7.25 13.5 2 12z"></path><path d="M16 3l1.5 4.5L22 9l-4.5 1.5L16 15l-1.5-4.5L10 9l4.5-1.5L16 3z"></path></svg>
    </button>
    <button type="button" class="btn-icon" [class.mic-recording]="isDictating['${f.id}']" (click)="startDictation('${f.context}', '${f.id}')" title="Dicter avec la voix">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c-1.7 0-3 1.2-3 2.8v7.4c0 1.6 1.3 2.8 3 2.8s3-1.2 3-2.8V4.8C15 3.2 13.7 2 12 2z"></path><path d="M19 10v2c0 3.9-3.1 7-7 7s-7-3.1-7-7v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
    </button>
  </div>
</label>`;
  });
});

// Also for risque.description which doesn't have an id attribute on the label
const risqueRegex = /<label>Description du risque<\/label>/g;
html = html.replace(risqueRegex, `<label style="display:flex; justify-content:space-between; align-items:center;">
  <span>Description du risque</span>
  <div style="display:flex; gap:0.5rem;">
    <button type="button" class="btn-icon" (click)="magicFill()" title="Générer avec l'IA ✨">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8b5cf6" stroke-width="2"><path d="M2 12l5.25-1.5L8.75 5.25 10.25 10.5 15.5 12l-5.25 1.5L8.75 18.75 7.25 13.5 2 12z"></path><path d="M16 3l1.5 4.5L22 9l-4.5 1.5L16 15l-1.5-4.5L10 9l4.5-1.5L16 3z"></path></svg>
    </button>
    <button type="button" class="btn-icon" [class.mic-recording]="isDictating['risqueDesc' + $index]" (click)="startDictation('incident', 'risqueDesc' + $index)" title="Dicter avec la voix">
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2c-1.7 0-3 1.2-3 2.8v7.4c0 1.6 1.3 2.8 3 2.8s3-1.2 3-2.8V4.8C15 3.2 13.7 2 12 2z"></path><path d="M19 10v2c0 3.9-3.1 7-7 7s-7-3.1-7-7v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>
    </button>
  </div>
</label>`);

// Fix save buttons to use isSubmitting
html = html.replace(/<button type="submit" class="btn btn-primary"(?:.*?)>Enregistrer<\/button>/g, `<button type="submit" class="btn btn-primary" [disabled]="isSubmitting()">{{ isSubmitting() ? 'Enregistrement...' : 'Enregistrer' }}</button>`);

fs.writeFileSync(path, html, 'utf8');
console.log('HTML updated successfully');
