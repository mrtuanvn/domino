# Domino Online

Domino 28 quan, kieu Mien Nam, 4 nguoi (ghe trong tu dong ghep Bot). Chia se link phong de moi ban be.

## Chay local

```
npm install
npm start
```

Mo http://localhost:3000, tao phong, bam "Sao chep link moi" gui cho ban be. Ai vao link se ngoi vao ghe trong; ghe con lai bam "Bat dau" se duoc Bot thay.

## Deploy len Render

1. Push code len GitHub repo.
2. Tren Render: New -> Web Service -> chon repo (repo co san `render.yaml` nen Render tu nhan cau hinh).
3. Build command: `npm install`, Start command: `npm start` (da co san trong render.yaml).
4. Sau khi deploy xong, dung URL Render cap de tao phong va gui link cho ban be.

Luu y: Vercel khong phu hop vi server dung Socket.io can ket noi lien tuc va giu trang thai trong bo nho - Vercel serverless function khong ho tro kieu nay.

## Luat & che do choi

- Bo 28 quan double-six, 4 nguoi (nguoi that + Bot), moi nguoi 7 quan, khong co no.
- Nguoi cam doi cao nhat (uu tien luc luc) di truoc.
- **Kieu chan**: van nao het bai truoc hoac bi chan (diem tay thap nhat khi ca 4 nguoi deu khong danh duoc) thi thang van do; ai thang du so van da chon truoc thi thang chung cuoc.
- **Kieu tinh diem**: nguoi thang van duoc cong diem = tong so cham con lai trong tay 3 nguoi kia; ai dat truoc muc diem da chon thi thang chung cuoc.
- Bot chi dung thong tin cong khai (bai cua no, quan da danh, suy luan tu luot bo cua doi thu) - khong doc duoc bai nguoi khac.
