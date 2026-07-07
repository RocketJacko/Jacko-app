const fs = require('fs');

try {
  let content = fs.readFileSync('src/components/views/dashboard/DashboardHistory.tsx', 'utf8');
  content = content.replace(/import\s+['"].*NequiPaymentModal\.css['"];\s*/g, '');
  fs.writeFileSync('src/components/views/dashboard/DashboardHistory.tsx', content, 'utf8');
  console.log('Fixed DashboardHistory.tsx');
} catch (e) {
  console.error(e);
}

try {
  const cssContent = fs.readFileSync('src/components/views/CheckoutView.css');
  const str = cssContent.toString('ascii');
  const clean = str.replace(/[^\x00-\x7F]/g, '');
  fs.writeFileSync('src/components/views/CheckoutView.css', clean, 'utf8');
  console.log('Fixed CheckoutView.css');
} catch (e) {
  console.error(e);
}
