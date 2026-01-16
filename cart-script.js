// Load Cart on Start
window.onload = function() {
    loadCart();
};

function loadCart() {
    // 1. Get Data
    let cart = JSON.parse(localStorage.getItem('myCart')) || [];
    const container = document.getElementById('cart-items');
    const billSection = document.getElementById('bill-details');
    const bottomBar = document.getElementById('bottom-bar');
    
    container.innerHTML = ""; // Clear list

    if (cart.length === 0) {
        // EMPTY STATE
        container.innerHTML = '<p class="empty-msg">Your cart is empty 😔<br><small>Go add some fresh milk!</small></p>';
        billSection.classList.add('hidden');
        bottomBar.classList.add('hidden');
        return;
    }

    // SHOW BILL & BUTTON
    billSection.classList.remove('hidden');
    bottomBar.classList.remove('hidden');

    // 2. Loop and Draw Items
    let totalBill = 0;

    cart.forEach((item, index) => {
        totalBill += item.price;

        const div = document.createElement('div');
        div.className = 'cart-item';
        div.innerHTML = `
            <div class="item-left">
                <div class="item-icon">${item.icon}</div>
                <div class="item-info">
                    <h4>${item.name}</h4>
                    <p>${item.size}</p>
                    <div class="item-price">₹${item.price}</div>
                </div>
            </div>
            <button class="btn-remove" onclick="removeItem(${index})">×</button>
        `;
        container.appendChild(div);
    });

    // 3. Update Bill
    document.getElementById('item-total').innerText = totalBill;
    document.getElementById('grand-total').innerText = totalBill; // + Delivery if needed
}

function removeItem(index) {
    let cart = JSON.parse(localStorage.getItem('myCart')) || [];
    
    // Remove item at that index
    cart.splice(index, 1);
    
    // Save back to memory
    localStorage.setItem('myCart', JSON.stringify(cart));
    
    // Reload page to show changes
    loadCart();
}

// Replace the placeOrder function in cart-script.js
function placeOrder() {
    // 1. Get the total amount text
    const totalAmount = document.getElementById('grand-total').innerText;
    
    // 2. Save it so the next page knows how much to charge
    localStorage.setItem('finalAmount', totalAmount);
    
    // 3. Go to Payment Page
    window.location.href = "payment.html";
}