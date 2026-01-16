// 1. DATA: Product Database
const products = [
    { 
        id: 1, 
        name: "Full Cream Milk", 
        icon: "🥛", 
        price: 36, 
        unit: "500ml", 
        options: [
            { label: "500ml", multiplier: 1 },
            { label: "1 Liter", multiplier: 2 },
            { label: "1.5 Liters", multiplier: 3 }
        ]
    },
    { 
        id: 2, 
        name: "Pot Curd", 
        icon: "🥣", 
        price: 45, 
        unit: "250g",
        options: [
            { label: "250g", multiplier: 1 },
            { label: "500g", multiplier: 2 },
            { label: "1 kg", multiplier: 4 }
        ]
    },
    { 
        id: 3, 
        name: "Pure Ghee", 
        icon: "🍯", 
        price: 240, 
        unit: "500ml",
        options: [
            { label: "250ml", multiplier: 0.5 },
            { label: "500ml", multiplier: 1 },
            { label: "1 Liter", multiplier: 2 }
        ]
    },
    { 
        id: 4, 
        name: "Paneer Cube", 
        icon: "🧀", 
        price: 50, 
        unit: "200g",
        options: [
            { label: "200g", multiplier: 1 },
            { label: "500g", multiplier: 2.5 },
            { label: "1 kg", multiplier: 5 }
        ]
    }
];

// 2. CHECK LOGIN & START
// We read the 'isLoggedIn' key from browser memory
let isUserLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

// Run these functions immediately when page loads
window.onload = function() {
    console.log("Page Loaded. User Logged In?", isUserLoggedIn); // Debug check
    updateUI();
    renderProducts();
};

// 3. UI LOGIC (Fixes Profile Visibility)
function updateUI() {
    const loginBtn = document.getElementById('btn-login');
    const profileMenu = document.getElementById('nav-profile');
    const heroTitle = document.getElementById('hero-title');
    const offerSection = document.getElementById('offer-section');
    const gridTitle = document.getElementById('grid-title');

    if (isUserLoggedIn) {
        // --- LOGGED IN ---
        if(loginBtn) loginBtn.classList.add('hidden');       // Hide Login
        if(profileMenu) profileMenu.classList.remove('hidden'); // Show Profile
        
        if(heroTitle) heroTitle.innerText = "Welcome back, Neighbor!";

        if(gridTitle) gridTitle.innerText = "Tap to Add Items To Cart";
        
        if(offerSection) offerSection.classList.add('hidden');
        
        // Update Name
        const nameDisplay = document.getElementById('display-name');
        if(nameDisplay) nameDisplay.innerText = "Member"; 

    } else {
        // --- GUEST ---
        if(loginBtn) loginBtn.classList.remove('hidden');    // Show Login
        if(profileMenu) profileMenu.classList.add('hidden');    // Hide Profile
        
        if(heroTitle) heroTitle.innerText = "Nature’s white gold, delivered.";
        if(gridTitle) gridTitle.innerText = "Fresh Arrivals"; 
        if(offerSection) offerSection.classList.remove('hidden');
    }
}

// 4. CARD ANIMATION LOGIC (Fixes "Pop Out")
function toggleCard(clickedCard) {
    // Check if this card is already open
    const isActive = clickedCard.classList.contains('active');
    
    // Close ALL other cards first (so only one is open at a time)
    document.querySelectorAll('.card').forEach(c => c.classList.remove('active'));
    
    // If it wasn't open before, Open it now
    if (!isActive) {
        clickedCard.classList.add('active');
    }
}

// 5. RENDER PRODUCTS (Draws the cards)
function renderProducts() {
    const container = document.getElementById('product-list');
    if(!container) return;
    
    container.innerHTML = ""; // Clear existing

    products.forEach(product => {
        const card = document.createElement('div');
        
        // IMPORTANT: Add the onclick event here so the animation triggers
        card.className = "card";
        card.onclick = function() { toggleCard(this); }; 
        
        if (isUserLoggedIn) {
            // --- USER CARD (Dynamic) ---
            card.innerHTML = `
                <div class="card-details">
                    <div class="card-img-placeholder">${product.icon}</div>
                    <p class="text-title">${product.name}</p>
                    
                    <select class="qty-select" onchange="updatePrice(this, ${product.price})" onclick="event.stopPropagation()">
                        ${product.options.map(opt => `<option value="${opt.multiplier}">${opt.label}</option>`).join('')}
                    </select>

                    <p class="text-price">₹<span class="price-val">${product.price}</span></p>
                </div>
                <button class="card-button" onclick="addToCart(event, ${product.id})">Add to Cart</button>
            `;
        } else {
            // --- GUEST CARD (Static) ---
            card.innerHTML = `
                <div class="card-details">
                    <div class="card-img-placeholder">${product.icon}</div>
                    <p class="text-title">${product.name}</p>
                    <p class="text-body">${product.unit}</p>
                    <p class="text-price">₹${product.price}</p>
                </div>
                <button class="card-button" onclick="checkAuth(event)">Login to Buy</button>
            `;
        }
        container.appendChild(card);
    });
}

// 6. PRICE UPDATE
function updatePrice(selectElement, basePrice) {
    const multiplier = parseFloat(selectElement.value);
    const newPrice = Math.round(basePrice * multiplier);
    const priceSpan = selectElement.parentElement.querySelector('.price-val');
    priceSpan.innerText = newPrice;
}

// 7. CART / AUTH ACTIONS
// [KEEP YOUR EXISTING DATA & LOGIN LOGIC AT THE TOP]
// ... (products array, isUserLoggedIn, window.onload etc.) ...

// [REPLACE YOUR addToCart and checkAuth FUNCTIONS WITH THESE]

// 1. ADD TO CART (Now saves to memory)
function addToCart(event, productId) {
    event.stopPropagation(); // Stop animation from closing

    if (!isUserLoggedIn) {
        alert("Please Login to shop!");
        window.location.href = "user_authentication.html";
        return;
    }

    // 1. Find the product in our "Database"
    const product = products.find(p => p.id === productId);

    // 2. Find what size the user selected (e.g., 500ml or 1 Liter)
    // We look inside the HTML card that was clicked
    const cardButton = event.target;
    const card = cardButton.closest('.card'); 
    const selectBox = card.querySelector('.qty-select');
    
    let multiplier = 1;
    let sizeLabel = product.unit;

    if (selectBox) {
        multiplier = parseFloat(selectBox.value);
        sizeLabel = selectBox.options[selectBox.selectedIndex].text;
    }

    // 3. Calculate Final Price based on size
    const finalPrice = Math.round(product.price * multiplier);

    // 4. Create the Item Object
    const itemToAdd = {
        id: Date.now(), // Unique ID for every item added
        productId: product.id,
        name: product.name,
        icon: product.icon,
        price: finalPrice,
        size: sizeLabel,
        qty: 1
    };

    // 5. Save to Local Storage
    let cart = JSON.parse(localStorage.getItem('myCart')) || [];
    cart.push(itemToAdd);
    localStorage.setItem('myCart', JSON.stringify(cart));

    // 6. Update UI
    updateCartBadge();
    alert(`Added ${sizeLabel} of ${product.name} to Cart!`);
}

// 2. UPDATE RED BADGE (Shows number of items)
function updateCartBadge() {
    const badge = document.getElementById('cart-badge');
    let cart = JSON.parse(localStorage.getItem('myCart')) || [];
    
    if(cart.length > 0) {
        badge.innerText = cart.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

// Call this when page loads to show current count
const originalOnLoad = window.onload;
window.onload = function() {
    if(originalOnLoad) originalOnLoad();
    updateCartBadge();
};

// 3. CART NAVIGATION
function checkAuth(action) {
    if (isUserLoggedIn) {
        window.location.href = "add_cart_page.html";
    } else {
        alert("Please login first.");
        window.location.href = "user_authentication.html";
    }
}

function logout() {
    if(confirm("Do you want to logout?")) {
        localStorage.removeItem('isLoggedIn');
        window.location.reload();
    }
}

function scrollToProducts() {
    const el = document.getElementById('products');
    if(el) el.scrollIntoView({ behavior: 'smooth' });
}
