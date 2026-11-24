const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const $ = (s, r = document) => r.querySelector(s);
const NAV = [['/', 'Home'], ['/team.html', 'Team'], ['/project.html', 'Project'], ['/planning/v1/', 'Planning v1'], ['/documents.html', 'Documents'], ['/admin.html', 'Admin']];
async function getJSON(u) { const r = await fetch(u); if (!r.ok) throw new Error(u + ' ' + r.status); return r.json(); }
async function boot() {
  const site = await getJSON('/site.json');
  let ver = { version: '1.0.0', commit: 'local', built: '' };
  try { ver = await getJSON('/version.json'); } catch {}
  const path = location.pathname.replace(/index\.html$/, '');
  $('#hdr').outerHTML = `<header class="top"><div class="in"><b>${esc(site.project)}</b>${NAV.map(([h, t]) =>
    `<a href="${h}" class="${path === h ? 'on' : ''}">${t}</a>`).join('')}</div></header>`;
  const commit = ver.fullCommit ? `<a href="https://github.com/${site.repo}/commit/${ver.fullCommit}">${esc(ver.commit)}</a>` : esc(ver.commit);
  $('#ftr').outerHTML = `<footer class="bot">${esc(site.team)} · ${esc(site.course)} (${esc(site.code)}) · Instructor: ${esc(site.instructor)}<br>
  Site v${esc(ver.version)} · commit ${commit} · deployed ${esc((ver.built || '').slice(0, 10))} · <a href="https://github.com/${site.repo}">Repository</a></footer>`;
  document.title = (document.title ? document.title + ' · ' : '') + site.project;
  return { site, ver };
}
