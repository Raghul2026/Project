// script.js

// 1. Check if user is ALREADY logged in from a previous session
// We check the LocalStorage key 'isLoggedIn'
let isUserLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

// 2. Logic for clicking the Card (Tap to Reveal)
function toggleCard(clickedCard) {
    const isActive = clickedCard.classList.contains('active');
    const allCards = document.querySelectorAll('.card');
    
    // Close other cards
    allCards.forEach(card => card.classList.remove('active'));

    // Toggle current card
    if (!isActive) {
        clickedCard.classList.add('active');
    }
}

// 3. Logic for clicking the "Add to Cart" Button
function addToCart(event) {
    event.stopPropagation(); // Stop card from toggling
    triggerProductAction();  // Check auth
}

// 4. Auth Check Logic
function triggerProductAction() {
    if (isUserLoggedIn) {
        // If logged in, go to Cart Page directly
        window.location.href = "add_cart_page.html"; 
    } else {
        console.log("User not logged in. Redirecting to auth screen...");
        // FIXED: Links to your existing file
        window.location.href = "user_authentication.html"; 
    }
}

// 5. Cart Icon Check
function checkAuth(action) {
    if (isUserLoggedIn) {
        if(action === 'cart') {
            window.location.href = "add_cart_page.html";
        }
    } else {
        alert("Please login to view your cart");
        // FIXED: Links to your existing file
        window.location.href = "user_authentication.html";
    }
}

// 6. Helper Functions (Scroll & Pincode)
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
