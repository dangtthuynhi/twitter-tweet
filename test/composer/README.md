# Bo test o soan thao

Chay code go bai cua bot len mot **Draft.js that**, trong Chromium that. X dung
Draft.js cho o soan thao, nen cac quy tac o day la quy tac that chu khong phai
suy doan.

## Chay

```sh
npm i -D playwright@1.44.1 react@17 react-dom@17 draft-js@0.11.7 immutable@3.7.6
npx playwright install chromium
node test/composer/run.mjs
```

Playwright 1.44 chu khong phai ban moi nhat: cac ban tu 1.49 tro len bo ho tro
Ubuntu 20.04.

`extract.mjs` rut NGUYEN VAN cac ham tu `browser-script/x-auto-poster.user.js`
roi nap vao trang thu. Bai test vi vay chay dung code that, khong phai mot ban
chep tay da khac di — sua code goc la bai test tu chay theo.

## Vi sao chi con thao tac dan

Do tung lenh mot tren Draft.js that, ket qua:

| Thao tac | Ket qua |
|---|---|
| `execCommand('insertText')` voi chuoi co `\n` | **Draft.js vo**, mat chu |
| `execCommand('insertText')` roi `'insertLineBreak'` | **Draft.js vo** |
| `execCommand('selectAll')` + `'delete'` | **Draft.js vo** |
| `execCommand('insertLineBreak')` mot minh | chay duoc |
| su kien `paste` (ClipboardEvent) | **dung, tron ven** |
| su kien `cut` sau khi boi den het | **dung, xoa sach** |

"Vo" la that: React nem `Failed to execute 'removeChild' on 'Node'` va go han o
soan thao khoi trang. Cac lenh execCommand sua DOM thang tay, ngoai tam kiem
soat cua React, nen cay DOM that va cay React hinh dung lech nhau, va lan render
ke tiep thi vap.

Mot cho de hieu nham: `isEmpty()` coi o da roi khoi trang la "sach". Nen khi mot
lenh xoa lam vo Draft.js, no van bao thanh cong. Bai test vi vay kiem rieng
"o soan thao con song" ben canh "o da sach".
