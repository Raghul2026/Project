// Virtual State
let isUserLoggedIn = false; 

// 1. Logic for clicking the Card (Tap to Reveal)
function toggleCard(clickedCard) {
    // Check if currently active
    const isActive = clickedCard.classList.contains('active');

    // Close ALL other cards first
    const allCards = document.querySelectorAll('.card');
    allCards.forEach(card => card.classList.remove('active'));

    // If it wasn't active, open it now
    if (!isActive) {
        clickedCard.classList.add('active');
    }
}

// 2. Logic for clicking the Button
function addToCart(event) {
    // Prevent the click from bubbling up to the card (which would close it)
    event.stopPropagation();
    
    // Proceed to auth check
    triggerProductAction();
}

// 3. Auth Check Logic
function triggerProductAction() {
    if (isUserLoggedIn) {
        alert("Product added to cart! (Virtual Action)");
        // window.location.href = "cart.html";
    } else {
        console.log("User not logged in. Redirecting...");
        window.location.href = "user_authentication.html"; 
    }
}

// 4. Cart Icon Check
function checkAuth(action) {
    if (isUserLoggedIn) {
        if(action === 'cart') {
            window.location.href = "add_cart_page.html";
        }
    } else {
        alert("Please login to view your cart");
        window.location.href = "user_authentication.html";
    }
}

// 5. Helper Functions
function scrollToProducts() {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

function checkPincode() {
    const pin = document.getElementById('pincodeInput').value;
    if(pin.length === 6) {
        alert("We deliver to " + pin + "! Login to check delivery charges.");
    } else {
        alert("Please enter a valid 6-digit pincode.");
    }
}
