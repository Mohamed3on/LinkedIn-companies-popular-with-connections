const puppeteer = require("puppeteer");
const chalk = require("chalk");
const fs = require("fs");
const { email, password } = require("./credentials");

const error = chalk.bold.red;
const success = chalk.bold.green;

const goToFriendsList = async (page, pageNumber) =>
  await page.goto(
    `https://www.linkedin.com/search/results/people/?facetNetwork=%5B%22F%22%5D&page=${pageNumber}`
  );

const autoScroll = async (page, distance = 600) => {
  await page.evaluate(async distance => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }, distance);
};

const blockImageRequests = async page => {
  await page.setRequestInterception(true);
  const blockedResources = ["image", "stylesheet", "other"];
  page.on("request", request => {
    if (blockedResources.includes(request.resourceType())) request.abort();
    else {
      request.continue();
    }
  });
};

(async () => {
  const browser = await puppeteer.launch({ headless: false });
  try {
    // open the headless browser

    const page = await browser.newPage();
    await blockImageRequests(page);

    // // enter url in page
    await page.goto(
      `https://www.linkedin.com/login?fromSignIn=true&trk=guest_homepage-basic_nav-header-signin`
    );

    await login(page);

    const companies = {};

    const profileURLs = await getProfileLinksInPage(page, 1);

    const numberOfPages = await getNumberOfPages(page);

    await addCompaniesOfConnections({ page, companies, profileURLs });

    for (let pageNumber = 2; pageNumber < numberOfPages; pageNumber++) {
      console.log(`Page number ${pageNumber}`);

      const profileURLs = await getProfileLinksInPage(page, pageNumber);

      await addCompaniesOfConnections({ page, companies, profileURLs });
      saveCompanies(companies);
    }

    const sortedCompanies = sortCompanies(companies);

    saveCompanies(sortedCompanies);
  } catch (err) {
    console.log(error(err));
  }
})();

async function login(page) {
  await page.type("#username", email);
  await page.type("#password", password);
  await page.click("[type=submit]");
}

async function getNumberOfPages(page) {
  const connectionsPerPage = 10;
  const totalConnections = await page.$eval(
    ".search-results__total",
    result => result.textContent.match(/(\d)+/g)[0]
  );
  return Math.round(totalConnections / connectionsPerPage);
}

async function addCompaniesOfConnections({ page, companies, profileURLs }) {
  for (const profileURL of profileURLs) {
    const company = await getCompanyFromProfile(page, profileURL);

    if (!companies[company]) companies[company] = 1;
    else companies[company]++;
  }
}

async function getProfileLinksInPage(page, pageNumber) {
  await goToFriendsList(page, pageNumber);
  await autoScroll(page);
  return page.$$eval(
    '.search-result__image-wrapper > [data-control-name="search_srp_result"]',
    accounts => accounts.map(account => account.href)
  );
}

function sortCompanies(companies) {
  let companiesArray = [];

  const sortFunction = (a, b) => {
    return b[1] - a[1];
  };

  for (let company in companies) {
    if (companies[company] > 1)
      companiesArray.push([company, companies[company]]);
  }

  return [...companiesArray].sort(sortFunction);
}

async function getCompanyFromProfile(page, profileURL) {
  await page.goto(profileURL);
  let company;
  try {
    company = await page.$eval(
      '[data-control-name="position_see_more"]',
      element => element.textContent.trim()
    );
  } catch (e) {
    company = "no company";
  }

  return company;
}

const saveCompanies = companies => {
  console.log(success("saving companies to disk..."));

  fs.writeFile("companies.json", JSON.stringify(companies), err => {
    if (err) console.log(err);
  });
};
