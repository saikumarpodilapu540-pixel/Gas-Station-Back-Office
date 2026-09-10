const round = value => Math.round((value + Number.EPSILON) * 100) / 100;
export function saleOptions(product) {
  if (!product) return [];
  return product.balances.map(balance => ({
    ...balance, available: balance.quantity - balance.reserved,
    price: balance.package.unitsPerPackage === 1 ? product.price : balance.sellingPrice == null ? null : Number(balance.sellingPrice)
  })).filter(balance => balance.available > 0);
}
export function quoteCart(cart, inventory) {
  let subtotal = 0, tax = 0;
  const requested = new Map();
  for (const line of cart) {
    const product = inventory.find(item => item.id === line.id);
    const option = saleOptions(product).find(balance => balance.packageId === line.packageId && balance.location === line.location);
    if (!option || option.price === null || !Number.isSafeInteger(Number(line.qty)) || Number(line.qty) < 1) return { error: 'Choose a product, available package and location, and a whole quantity for every line.' };
    const key = `${line.id}/${line.packageId}/${line.location}`;
    requested.set(key, (requested.get(key) || 0) + Number(line.qty));
    if (requested.get(key) > option.available) return { error: `Insufficient unreserved ${option.package.name} in ${option.location}. Open a pack or restock first.` };
    const value = round(option.price * Number(line.qty));
    subtotal += value; tax += round(value * product.taxRate);
  }
  return { subtotal: round(subtotal), tax: round(tax), total: round(subtotal + tax) };
}
