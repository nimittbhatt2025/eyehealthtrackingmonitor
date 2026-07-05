#!/usr/bin/env python3
"""
Quick test to check if the registration endpoint works
"""
import requests
import json

print("🧪 Testing Registration Endpoint...")
print()

# Test data
data = {
    "email": "test@example.com",
    "password": "testpassword123",
    "name": "Test User"
}

try:
    # Make registration request
    response = requests.post(
        "http://localhost:5001/api/auth/register",
        json=data,
        headers={"Content-Type": "application/json"}
    )
    
    print(f"Status Code: {response.status_code}")
    print(f"Response: {json.dumps(response.json(), indent=2)}")
    
    if response.status_code == 201:
        print("\n Registration endpoint works!")
    else:
        print(f"\n  Registration returned {response.status_code}")
        
except requests.exceptions.ConnectionError:
    print(" Cannot connect to backend. Is it running on port 5001?")
except Exception as e:
    print(f" Error: {e}")
