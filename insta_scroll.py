import time
import random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

def get_driver():
    options = webdriver.ChromeOptions()
    # options.add_argument("--headless") # Commented out so user can see/interact
    # Suppress logging
    options.add_experimental_option('excludeSwitches', ['enable-logging'])
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    return driver

def main():
    print("Initializing Browser...")
    driver = get_driver()
    
    try:
        driver.get("https://www.instagram.com/")
        print("\n" + "="*50)
        print("ACTION REQUIRED:")
        print("1. Log in to Instagram in the browser window.")
        print("2. Navigate to the specific DM/Group Chat you want to scrape.")
        print("3. Ensure the chat is open and you can see the messages.")
        print("="*50 + "\n")
        
        input("Press Enter here once you have opened the specific chat...")
        
        print("Starting scroll process...")
        print("Note: This script blindly scrolls UP all scrollable containers it finds.")
        print("Press Ctrl+C in this terminal to stop early.\n")

        # Scroll loop
        consecutive_no_load = 0
        total_scrolls = 0
        
        while True:
            # This script attempts to find the chat container by checking for scrollable divs where scrollTop > 0
            # and setting scrollTop = 0 to trigger loading older messages.
            
            scrolled = driver.execute_script("""
                var scrolled = false;
                var divs = document.querySelectorAll('div');
                for (var i = 0; i < divs.length; i++) {
                    var style = window.getComputedStyle(divs[i]);
                    // Check if element is vertical scrollable
                    if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && divs[i].scrollHeight > divs[i].clientHeight) {
                        // If we are not at the top, scroll to top
                        if (divs[i].scrollTop > 0) {
                            divs[i].scrollTop = 0;
                            scrolled = true;
                        }
                    }
                }
                return scrolled;
            """)

            if scrolled:
                print(f"Scrolled up... (Total iterations: {total_scrolls})")
                consecutive_no_load = 0
                total_scrolls += 1
                # Wait for content to load. Randomize slightly to be less bot-like.
                time.sleep(3 + random.random() * 2) 
            else:
                # If we didn't scroll anything, maybe it's already at the top or loading takes time?
                print("At top or waiting for load...", end='\r')
                consecutive_no_load += 1
                time.sleep(1)
            
            # Check for image count as a progress indicator
            imgs = driver.find_elements(By.TAG_NAME, "img")
            # print(f"Current visible images: {len(imgs)}", end='\r')

            if consecutive_no_load > 30: # ~30 seconds of no movement
                print("\nNo scrolling possible for 30 seconds. Assuming we reached the start of the chat.")
                break
                
    except KeyboardInterrupt:
        print("\nStopping by user request.")
    except Exception as e:
        print(f"\nAn error occurred: {e}")
    finally:
        print("\nProcess finished. The browser will remain open for you to verify.")
        input("Press Enter to close the browser and exit...")
        driver.quit()

if __name__ == "__main__":
    main()
