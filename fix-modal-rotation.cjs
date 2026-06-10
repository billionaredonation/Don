const fs = require('fs');
const path = require('path');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function write(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function replaceAll(content, from, to) {
  return content.split(from).join(to);
}

function patchFile(filePath, patcher) {
  const abs = path.resolve(process.cwd(), filePath);

  if (!fs.existsSync(abs)) {
    console.log(`SKIP: ${filePath} не найден`);
    return;
  }

  const before = read(abs);
  const after = patcher(before);

  if (before === after) {
    console.log(`NO CHANGE: ${filePath}`);
    return;
  }

  write(abs, after);
  console.log(`PATCHED: ${filePath}`);
}

/**
 * 1. Главный фикс:
 * На мобилке модалки были повернуты rotate(90deg).
 * Для iPhone в положении фронталка слева / кнопка питания справа
 * нужно rotate(-90deg), чтобы верх модалки смотрел к кнопке питания.
 */
patchFile('src/styles/home/modals.css', (css) => {
  let next = css;

  next = replaceAll(next, 'transform: rotate(90deg) !important;', 'transform: rotate(-90deg) !important;');

  next = replaceAll(
    next,
    `    transform: rotate(90deg) !important;`,
    `    transform: rotate(-90deg) !important;`
  );

  next = replaceAll(
    next,
    `  /*
    По твоей стрелке — поворот вправо.
    Верх модалки направлен к кнопке питания iPhone при landscape с фронталкой слева.
  */
  transform: rotate(90deg) !important;`,
    `  /*
    По твоей стрелке — поворот вправо.
    Верх модалки направлен к кнопке питания iPhone при landscape с фронталкой слева.
  */
  transform: rotate(-90deg) !important;`
  );

  return next;
});

/**
 * 2. Модалки домов / панели домов.
 */
patchFile('src/houses/houses.css', (css) => {
  let next = css;

  next = replaceAll(next, 'transform: rotate(90deg) !important;', 'transform: rotate(-90deg) !important;');

  next = replaceAll(
    next,
    `    transform: rotate(90deg) !important;`,
    `    transform: rotate(-90deg) !important;`
  );

  return next;
});

/**
 * 3. Админская панель выбора дома.
 * Тут rotate стоит внутри многострочного transform.
 */
patchFile('src/admin/adminPanel.css', (css) => {
  let next = css;

  next = replaceAll(next, 'rotate(90deg) !important;', 'rotate(-90deg) !important;');

  next = replaceAll(
    next,
    `    transform:
      translateX(-50%)
      rotate(90deg) !important;`,
    `    transform:
      translateX(-50%)
      rotate(-90deg) !important;`
  );

  return next;
});

/**
 * 4. Поднимаем версию импорта modals.css,
 * чтобы iPhone не держал старый CSS из кеша.
 */
patchFile('pages/home/home.css', (css) => {
  let next = css;

  next = next.replace(
    /@import\s+['"]\.\.\/\.\.\/src\/styles\/home\/modals\.css\?v=\d+['"];/,
    `@import '../../src/styles/home/modals.css?v=113';`
  );

  if (!next.includes(`@import '../../src/styles/home/modals.css?v=113';`)) {
    next = next.replace(
      `@import '../../src/styles/home/modals.css';`,
      `@import '../../src/styles/home/modals.css?v=113';`
    );
  }

  return next;
});

/**
 * 5. Поднимаем версию home.css в index.html,
 * чтобы браузер точно забрал свежий CSS.
 */
patchFile('index.html', (html) => {
  let next = html;

  next = next.replace(
    /<link rel="stylesheet" href="\.\/pages\/home\/home\.css\?v=\d+"\s*\/>/,
    `<link rel="stylesheet" href="./pages/home/home.css?v=113" />`
  );

  next = next.replace(
    `<link rel="stylesheet" href="./pages/home/home.css" />`,
    `<link rel="stylesheet" href="./pages/home/home.css?v=113" />`
  );

  return next;
});

console.log('');
console.log('Готово.');
console.log('Проверь на iPhone: фронталка слева, кнопка питания справа.');
console.log('Верх всех модалок должен смотреть в сторону кнопки питания.');
