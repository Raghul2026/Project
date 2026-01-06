// Virtual State: Is the user logged in?
// In a real app, this would come from a database/session
let isUserLoggedIn = false; 

// 1. Function to handle clicking a product
function triggerProductAction() {
    if (isUserLoggedIn) {
        // If logged in -> Add to cart or go to product details
        alert("Product added to cart! (Virtual Action)");
        // window.location.href = "cart.html";
    } else {
        // If NOT logged in -> Redirect to Authentication
        console.log("User not logged in. Redirecting...");
        window.location.href = "user_authentication.html"; 
        // Note: You must create a file named 'user_authentication.html'
    }
}

// 2. Function to handle cart icon click
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

// 3. Simple Scroll function for "Shop Now" button
function scrollToProducts() {
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
}

// 4. Delivery Pincode Logic (Visual Only)
function checkPincode() {
    const pin = document.getElementById('pincodeInput').value;
    if(pin.length === 6) {
        alert("We deliver to " + pin + "! Login to check delivery charges.");
    } else {
        alert("Please enter a valid 6-digit pincode.");
    }
}