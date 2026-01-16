window.onload = function() {
    // 1. Get the amount we saved in the Cart page
    const amount = localStorage.getItem('finalAmount') || "0";
    document.getElementById('pay-display').innerText = amount;
};

function confirmOrder() {
    // 1. Check if user selected an option
    const selectedOption = document.querySelector('input[name="payment"]:checked');
    
    if (!selectedOption) {
        alert("Please select a payment method!");
        return;
    }

    // 2. Simulate Payment Processing
    const method = selectedOption.value;
    // In a real app, this is where you'd open the GPay/PhonePe intent
    
    // 3. Clear the Cart (Order is done)
    localStorage.removeItem('myCart');
    
    // 4. Redirect to Final Success Page
    // We will build this next: 'order_success.html'
    window.location.href = "order_success.html"; 
}