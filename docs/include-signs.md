# INCLUDE signs in Sign → Text

Sign → Text recognizes the 262 signs of the [INCLUDE dataset](https://zenodo.org/records/4010759) (AI4Bharat / IIT Madras, CC BY 4.0) with a trained model (`mobile/assets/signpacks/include.signpack`). This page lists every sign and how it did on recordings the model never saw. Text → ISL can show every one of them, as motion traced from one INCLUDE recording per sign (`mobile/assets/motions/include-motion.signpack`, see [`sign-packs.md`](sign-packs.md#motion-pack-for-text--isl)); the results below are about recognition only.

## How it was tested

- INCLUDE has about 16 videos per sign, recorded in sessions of three takes by Deaf students of one school. For each sign, the last recording session was held out for testing and the one before for validation; the model was trained on the rest.
- Each held-out video was played frame by frame into the same recognition session as the app (`npm run eval:signpack`), with the settings for when a sign is shown chosen on the validation videos (`npm run tune:model`: confidence 0.9, lead 0.15, 5 predictions in a row).
- Result on 730 held-out videos: **32% right, 4% wrong, 64% "not sure"**. The app prefers "not sure" to a wrong sign.
- The model in the app was then retrained on every recording with the same settings, which usually helps a little; the figures here are from the held-out test.
- Test sessions may share signers with training sessions, so people who sign differently (other regions, other schools) will see more "not sure". The app has not been tested with users yet.

**works**: right on at least two thirds of its test videos (84 signs) · **sometimes**: right at least once (36) · **not yet**: never right, usually "not sure" (140) · **not tested**: no held-out session (2)

## Adjectives (17 of 59 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Alive | works | 4 of 4 right |
| Bad | works | 1 of 1 right |
| Beautiful | sometimes | 1 of 4 right |
| Big / large | works | 3 of 3 right |
| Blind | works | 4 of 4 right |
| Cheap | not yet | 0 of 1 right |
| Clean | not yet | 0 of 4 right |
| Cold | works | 2 of 3 right |
| Cool | not yet | 0 of 3 right |
| Curved | not yet | 0 of 4 right |
| Dead | sometimes | 1 of 4 right |
| Deaf | not yet | 0 of 4 right |
| Deep | not yet | 0 of 4 right |
| Dirty | not yet | 0 of 4 right |
| Dry | sometimes | 1 of 3 right |
| Expensive | not yet | 0 of 4 right |
| Famous | works | 2 of 3 right |
| Fast | sometimes | 1 of 3 right |
| Female | not yet | 0 of 4 right, 1 wrong |
| Flat | sometimes | 1 of 4 right |
| Good | not yet | 0 of 3 right, 3 wrong |
| Happy | not yet | 0 of 3 right |
| Hard | not yet | 0 of 4 right |
| Healthy | works | 3 of 3 right |
| Heavy | not yet | 0 of 4 right |
| High | works | 4 of 4 right |
| Hot | works | 3 of 3 right |
| Light | not yet | 0 of 4 right |
| Long | not yet | 0 of 3 right |
| Loose | not yet | 0 of 4 right |
| Loud | not yet | 0 of 3 right |
| Low | works | 4 of 4 right |
| Male | not yet | 0 of 4 right, 3 wrong |
| Mean | sometimes | 1 of 4 right |
| Narrow | not yet | 0 of 1 right |
| New | works | 3 of 3 right |
| Nice | not tested |  |
| Old | not yet | 0 of 3 right |
| Poor | sometimes | 1 of 4 right |
| Quiet | not yet | 0 of 3 right |
| Rich | not yet | 0 of 4 right, 1 wrong |
| Sad | works | 3 of 4 right |
| Shallow | not yet | 0 of 4 right |
| Short | works | 2 of 3 right |
| Sick | works | 3 of 3 right |
| Slow | not yet | 0 of 3 right |
| Small / little | works | 3 of 3 right |
| Soft | not yet | 0 of 4 right |
| Strong | sometimes | 1 of 4 right |
| Tall | sometimes | 1 of 3 right |
| Thick | not yet | 0 of 4 right |
| Thin | not tested |  |
| Tight | not yet | 0 of 4 right |
| Ugly | not yet | 0 of 4 right |
| Warm | works | 3 of 3 right |
| Weak | sometimes | 1 of 4 right |
| Wet | not yet | 0 of 1 right |
| Wide | not yet | 0 of 3 right |
| Young | works | 2 of 3 right |

## Animals (2 of 8 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Animal | works | 2 of 2 right |
| Bird | sometimes | 1 of 2 right |
| Cat | sometimes | 1 of 2 right |
| Cow | works | 2 of 2 right |
| Dog | sometimes | 1 of 2 right |
| Fish | not yet | 0 of 2 right |
| Horse | not yet | 0 of 2 right |
| Mouse | not yet | 0 of 2 right |

## Clothes (7 of 10 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Clothing | not yet | 0 of 1 right |
| Dress | not yet | 0 of 1 right |
| Hat | works | 1 of 1 right |
| Pant | works | 1 of 1 right |
| Pocket | works | 1 of 1 right |
| Shirt | works | 1 of 1 right |
| Shoes | not yet | 0 of 1 right |
| Skirt | works | 1 of 1 right |
| Suit | works | 1 of 1 right |
| T-Shirt | works | 1 of 1 right |

## Colours (5 of 11 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Black | not yet | 0 of 1 right |
| Blue | works | 1 of 1 right |
| Brown | not yet | 0 of 1 right |
| Colour | works | 1 of 1 right |
| Green | works | 1 of 1 right |
| Grey | not yet | 0 of 1 right |
| Orange | not yet | 0 of 1 right |
| Pink | not yet | 0 of 1 right |
| Red | works | 1 of 1 right |
| White | works | 1 of 1 right |
| Yellow | not yet | 0 of 1 right |

## Days and Time (3 of 21 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Afternoon | not yet | 0 of 3 right |
| Evening | works | 3 of 3 right |
| Friday | not yet | 0 of 3 right |
| Hour | works | 3 of 3 right |
| Minute | not yet | 0 of 3 right |
| Monday | sometimes | 1 of 3 right |
| Month | not yet | 0 of 3 right |
| Morning | not yet | 0 of 3 right |
| Night | not yet | 0 of 4 right |
| Saturday | not yet | 0 of 3 right, 2 wrong |
| Second | not yet | 0 of 9 right |
| Sunday | works | 3 of 3 right |
| Thursday | not yet | 0 of 3 right |
| Time | not yet | 0 of 4 right |
| Today | not yet | 0 of 3 right, 1 wrong |
| Tomorrow | not yet | 0 of 3 right |
| Tuesday | not yet | 0 of 3 right |
| Wednesday | not yet | 0 of 3 right |
| Week | not yet | 0 of 3 right |
| Year | not yet | 0 of 4 right |
| Yesterday | not yet | 0 of 3 right |

## Electronics (2 of 10 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Camera | works | 3 of 3 right |
| Cell phone | sometimes | 1 of 3 right, 1 wrong |
| Clock | not yet | 0 of 3 right |
| Computer | works | 3 of 3 right |
| Fan | not yet | 0 of 3 right |
| Lamp | not yet | 0 of 3 right |
| Laptop | not yet | 0 of 3 right |
| Radio | not yet | 0 of 3 right, 1 wrong |
| Screen | not yet | 0 of 3 right |
| Television | not yet | 0 of 3 right |

## Greetings (5 of 9 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Alright | works | 2 of 3 right |
| Good afternoon | works | 3 of 3 right |
| Good evening | not yet | 0 of 2 right |
| Good Morning | works | 3 of 3 right |
| Good night | not yet | 0 of 4 right |
| Hello | works | 2 of 3 right |
| How are you | not yet | 0 of 3 right |
| Pleased | sometimes | 2 of 4 right |
| Thank you | works | 4 of 4 right |

## Home (10 of 27 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Bag | sometimes | 1 of 3 right |
| Bathroom | not yet | 0 of 3 right |
| Bed | not yet | 0 of 3 right |
| Bedroom | not yet | 0 of 3 right |
| Book | not yet | 0 of 3 right |
| Box | not yet | 0 of 3 right |
| Card | not yet | 0 of 3 right |
| Chair | works | 2 of 3 right |
| Door | sometimes | 1 of 3 right |
| Dream | not yet | 0 of 3 right |
| Gift | not yet | 0 of 3 right |
| Key | not yet | 0 of 3 right |
| Kitchen | works | 3 of 3 right |
| Letter | not yet | 0 of 3 right |
| Lock | not yet | 0 of 3 right |
| Page | works | 2 of 3 right |
| Paint | works | 3 of 3 right |
| Paper | works | 2 of 3 right |
| Pen | works | 2 of 3 right |
| Pencil | not yet | 0 of 3 right |
| Photograph | not yet | 0 of 3 right |
| Ring | sometimes | 1 of 3 right |
| Soap | works | 3 of 3 right |
| Table | works | 2 of 3 right |
| Telephone | works | 3 of 3 right |
| Tool | not yet | 0 of 3 right |
| Window | works | 3 of 3 right |

## Jobs (5 of 16 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Actor | sometimes | 1 of 3 right |
| Artist | not yet | 0 of 3 right |
| Author | not yet | 0 of 3 right |
| Doctor | not yet | 0 of 3 right |
| Job | works | 3 of 3 right |
| Lawyer | sometimes | 1 of 3 right |
| Manager | not yet | 0 of 3 right |
| Patient | works | 3 of 3 right |
| Police | sometimes | 1 of 3 right |
| Priest | works | 3 of 3 right |
| Reporter | sometimes | 1 of 3 right |
| Secretary | not yet | 0 of 3 right |
| Soldier | not yet | 0 of 3 right, 1 wrong |
| Student | not yet | 0 of 3 right |
| Teacher | works | 3 of 3 right |
| Waiter | works | 3 of 3 right |

## Means of Transportation (2 of 9 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Bicycle | not yet | 0 of 2 right |
| Boat | not yet | 0 of 2 right |
| Bus | not yet | 0 of 2 right |
| Car | works | 2 of 2 right |
| Plane | not yet | 0 of 2 right |
| Train | not yet | 0 of 2 right |
| Train ticket | sometimes | 1 of 2 right, 1 wrong |
| Transportation | sometimes | 1 of 2 right |
| Truck | works | 2 of 2 right |

## People (12 of 26 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Adult | works | 1 of 1 right |
| Baby | not yet | 0 of 1 right |
| Boy | not yet | 0 of 1 right |
| Brother | works | 1 of 1 right |
| Child | not yet | 0 of 1 right |
| Crowd | works | 1 of 1 right |
| Daughter | not yet | 0 of 1 right |
| Family | not yet | 0 of 1 right |
| Father | not yet | 0 of 1 right |
| Friend | not yet | 0 of 1 right |
| Girl | not yet | 0 of 1 right |
| Grandfather | works | 1 of 1 right |
| Grandmother | works | 1 of 1 right |
| Husband | works | 1 of 1 right |
| King | works | 1 of 1 right |
| Man | works | 1 of 1 right |
| Mother | works | 1 of 1 right |
| Neighbour | not yet | 0 of 1 right |
| Parent | not yet | 0 of 1 right, 1 wrong |
| Player | not yet | 0 of 1 right |
| President | not yet | 0 of 1 right |
| Queen | works | 1 of 1 right |
| Sister | works | 1 of 1 right |
| Son | not yet | 0 of 1 right |
| Wife | not yet | 0 of 1 right |
| Woman | works | 1 of 1 right |

## Places (2 of 19 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Bank | not yet | 0 of 4 right |
| City | not yet | 0 of 4 right |
| Court | works | 4 of 5 right |
| Ground | not yet | 0 of 5 right |
| Hospital | works | 4 of 4 right |
| House | not yet | 0 of 4 right |
| India | sometimes | 3 of 5 right |
| Library | not yet | 0 of 4 right |
| Location | not yet | 0 of 4 right |
| Market | not yet | 0 of 4 right, 1 wrong |
| Office | not yet | 0 of 4 right, 3 wrong |
| Park | not yet | 0 of 5 right |
| Restaurant | not yet | 0 of 4 right |
| School | sometimes | 1 of 4 right |
| Store / Shop | not yet | 0 of 6 right, 5 wrong |
| Street / Road | sometimes | 2 of 4 right |
| Temple | sometimes | 1 of 5 right |
| Train Station | sometimes | 2 of 4 right |
| University | sometimes | 3 of 5 right |

## Pronouns (4 of 8 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| He | sometimes | 1 of 3 right |
| I | works | 1 of 1 right |
| It | works | 3 of 3 right |
| She | sometimes | 1 of 3 right |
| They | works | 3 of 3 right |
| We | sometimes | 1 of 3 right |
| You | not yet | 0 of 4 right, 3 wrong |
| You (plural) | works | 2 of 3 right |

## Seasons (3 of 6 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Fall | not yet | 0 of 4 right |
| Monsoon | works | 3 of 3 right |
| Season | works | 3 of 3 right |
| Spring | not yet | 0 of 3 right |
| Summer | works | 3 of 3 right |
| Winter | not yet | 0 of 3 right |

## Society (5 of 23 work)

| Sign | Result | Test videos |
| --- | --- | --- |
| Attack | not yet | 0 of 3 right |
| Ball | not yet | 0 of 4 right, 1 wrong |
| Bill | not yet | 0 of 3 right |
| Death | not yet | 0 of 3 right |
| Election | not yet | 0 of 3 right, 1 wrong |
| Energy | sometimes | 1 of 3 right |
| Exercise | sometimes | 1 of 3 right |
| God | not yet | 0 of 3 right |
| Gun | not yet | 0 of 3 right |
| Marriage | works | 3 of 3 right |
| Medicine | not yet | 0 of 3 right |
| Money | not yet | 0 of 3 right, 1 wrong |
| Newspaper | works | 3 of 3 right |
| Peace | works | 3 of 3 right |
| Price | works | 3 of 3 right |
| Race (ethnicity) | not yet | 0 of 3 right |
| Religion | works | 3 of 3 right |
| Science | not yet | 0 of 3 right |
| Sign | not yet | 0 of 3 right |
| Sport | not yet | 0 of 3 right |
| Team | not yet | 0 of 3 right |
| Technology | not yet | 0 of 3 right |
| War | not yet | 0 of 3 right |
